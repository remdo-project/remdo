import base64
import hashlib
import re
import socket
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlsplit

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from documents.models import Document

from .delegated import OIDCAdapter, signing_key_pem
from .models import SigningKey, User

CLIENT_ID = "https://claude.example/oauth/mcp-oauth-client-metadata"
REDIRECT_URI = "https://claude.example/api/mcp/auth_callback"
# Shaped like Claude's published client metadata, which declares no scope.
CLIENT_METADATA = {
    "client_id": CLIENT_ID,
    "client_name": "Claude",
    "redirect_uris": [REDIRECT_URI],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none",
}
VERIFIER = "v" * 64
CHALLENGE = (
    base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest()).rstrip(b"=").decode()
)


def fetch_metadata(client_id):
    assert client_id == CLIENT_ID
    return CLIENT_METADATA


def public_address(host, *args, **kwargs):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 443))]


@patch("allauth.idp.oidc.internal.cimd.fetch_metadata", fetch_metadata)
@patch("accounts.delegated.socket.getaddrinfo", public_address)
class DelegatedAccessTests(TestCase):
    def setUp(self):
        # CIMD fetches are rate limited through the cache, which outlives a test.
        cache.clear()
        self.user = User.objects.create_user(email="owner@example.test", password="pw-123456789")

    def authorize_query(self, **extra):
        return urlencode(
            {
                "response_type": "code",
                "client_id": CLIENT_ID,
                "redirect_uri": REDIRECT_URI,
                "code_challenge": CHALLENGE,
                "code_challenge_method": "S256",
                "state": "state-1",
                "scope": "openid",
                **extra,
            }
        )

    def grant(self):
        self.client.force_login(self.user)
        page = self.client.get(f"/identity/o/authorize?{self.authorize_query()}")
        self.assertEqual(page.status_code, 200, page.content[:500])
        signed = re.search(rb'name="request" value="([^"]+)"', page.content).group(1).decode()
        response = self.client.post(
            "/identity/o/authorize",
            {
                "request": signed,
                "scopes": "openid",
                "action": "grant",
            },
        )
        self.assertEqual(response.status_code, 302, response.content[:500])
        code = parse_qs(urlsplit(response["Location"]).query)["code"][0]
        self.client.logout()
        token = self.client.post(
            "/identity/o/api/token",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": REDIRECT_URI,
                "client_id": CLIENT_ID,
                "code_verifier": VERIFIER,
            },
        )
        self.assertEqual(token.status_code, 200, token.content[:500])
        return token.json()

    def bearer(self, token):
        return {"Authorization": f"Bearer {token}"}

    def documents(self, token):
        return self.client.get("/api/documents", headers=self.bearer(token))

    def authorize_collaboration(self, token, document):
        return self.client.get(
            f"/internal/collaboration/documents/{document.pk}/authorize",
            headers={
                "X-Remdo-Collaboration-Secret": settings.COLLAB_INTERNAL_SECRET,
                **self.bearer(token),
            },
        )

    def test_granted_token_acts_as_the_user_on_the_api_and_collaboration(self):
        tokens = self.grant()
        response = self.documents(tokens["access_token"])
        self.assertEqual(response.status_code, 200)
        own = Document.objects.get(owner=self.user)
        self.assertEqual([item["id"] for item in response.json()], [own.pk])

        other = Document.objects.get(owner=User.objects.create_user(email="other@example.test"))
        self.assertEqual(self.authorize_collaboration(tokens["access_token"], own).status_code, 200)
        self.assertEqual(
            self.authorize_collaboration(tokens["access_token"], other).status_code, 403
        )
        rejected = self.documents("not-a-token")
        self.assertEqual(rejected.status_code, 401)
        self.assertEqual(rejected["WWW-Authenticate"], "Bearer")

    def test_token_is_not_accepted_on_session_only_pages(self):
        tokens = self.grant()
        response = self.client.get(
            "/accounts/connected-apps/", headers=self.bearer(tokens["access_token"])
        )
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response["Location"].startswith("/accounts/login/"))

    def test_staff_accounts_cannot_grant_or_keep_delegated_access(self):
        tokens = self.grant()
        self.user.is_staff = True
        self.user.save()
        self.assertEqual(self.documents(tokens["access_token"]).status_code, 401)

        self.client.force_login(self.user)
        page = self.client.get(f"/identity/o/authorize?{self.authorize_query()}")
        self.assertEqual(page.status_code, 403)
        self.assertContains(page, "Administrator accounts", status_code=403)

    def test_only_client_metadata_documents_and_the_code_flow_can_grant(self):
        self.client.force_login(self.user)
        page = self.client.get(
            f"/identity/o/authorize?{self.authorize_query(client_id='registered')}"
        )
        self.assertContains(page, "didn't identify itself", status_code=400)
        device = self.client.post("/identity/o/api/device/code", {"client_id": CLIENT_ID})
        self.assertEqual(device.status_code, 404)
        self.assertEqual(self.client.get("/identity/o/logout").status_code, 404)

    def test_access_is_granted_only_after_consent_through_the_code_flow(self):
        self.grant()
        self.client.force_login(self.user)
        queries = (
            self.authorize_query(prompt="none"),
            self.authorize_query(prompt="login"),
            self.authorize_query(response_type="token"),
        )
        for query in queries:
            response = self.client.get(f"/identity/o/authorize?{query}")
            self.assertContains(response, "doesn't support", status_code=400)

    def refresh(self, token):
        return self.client.post(
            "/identity/o/api/token",
            {"grant_type": "refresh_token", "refresh_token": token, "client_id": CLIENT_ID},
        )

    def test_refresh_replaces_the_refresh_token(self):
        tokens = self.grant()
        renewed = self.refresh(tokens["refresh_token"])
        self.assertEqual(renewed.status_code, 200)
        self.assertNotEqual(renewed.json()["refresh_token"], tokens["refresh_token"])
        self.assertEqual(self.documents(renewed.json()["access_token"]).status_code, 200)
        self.assertEqual(self.refresh(tokens["refresh_token"]).status_code, 400)

    def test_connected_apps_lists_and_revokes_a_grant(self):
        tokens = self.grant()
        self.client.force_login(self.user)
        page = self.client.get("/accounts/connected-apps/")
        self.assertContains(page, "Claude")
        self.client.post("/accounts/connected-apps/", {"client": CLIENT_ID})
        self.assertContains(self.client.get("/accounts/connected-apps/"), "No apps are connected.")
        self.client.logout()
        own = Document.objects.get(owner=self.user)
        self.assertEqual(self.documents(tokens["access_token"]).status_code, 401)
        self.assertEqual(self.authorize_collaboration(tokens["access_token"], own).status_code, 403)


class SigningKeyTests(TestCase):
    def test_key_is_stored_encrypted_and_replaced_under_a_new_secret(self):
        pem = signing_key_pem()
        self.assertIn("PRIVATE KEY", pem)
        self.assertNotIn("PRIVATE KEY", SigningKey.objects.get().encrypted_pem)
        self.assertEqual(signing_key_pem(), pem)
        with override_settings(SECRET_KEY="another-secret-" + "x" * 40):
            self.assertNotEqual(signing_key_pem(), pem)
        self.assertEqual(SigningKey.objects.count(), 1)


class ClientMetadataHostTests(TestCase):
    def test_metadata_is_fetched_only_from_public_hosts(self):
        adapter = OIDCAdapter()
        self.assertFalse(adapter.is_cimd_url_allowed("https://localhost/metadata"))
        self.assertFalse(adapter.is_cimd_url_allowed("https://10.0.0.1/metadata"))
        with patch("accounts.delegated.socket.getaddrinfo", public_address):
            self.assertTrue(adapter.is_cimd_url_allowed("https://claude.example/metadata"))
