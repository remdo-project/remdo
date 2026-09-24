import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount, SocialToken
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command
from django.test import Client, TestCase, override_settings

from .models import User


class DeploymentAccountTests(TestCase):
    # The command reads the process environment, so each case states every
    # variable it depends on rather than inheriting the developer's shell.
    SELF_HOSTED = {"RENDER": "", "REMDO_USER_PASSWORD": ""}
    BOOTSTRAP_ADMIN_ONLY = {**SELF_HOSTED, "REMDO_ADMIN_PASSWORD": "first-admin-password"}

    def test_configured_accounts_are_created_once_from_present_passwords(self):
        with patch.dict(
            os.environ,
            self.BOOTSTRAP_ADMIN_ONLY,
        ):
            call_command("setup_configured_users")

        admin = User.objects.get(email="admin@example.test")
        self.assertTrue(admin.is_staff and admin.is_superuser)
        self.assertTrue(admin.check_password("first-admin-password"))
        self.assertFalse(User.objects.filter(email="user@example.test").exists())

        admin.set_password("changed-admin-password")
        admin.is_staff = admin.is_superuser = False
        admin.save()
        with patch.dict(
            os.environ,
            {
                **self.SELF_HOSTED,
                "REMDO_ADMIN_PASSWORD": "replacement-admin-password",
                "REMDO_USER_PASSWORD": "first-user-password",
            },
        ):
            call_command("setup_configured_users")

        admin.refresh_from_db()
        user = User.objects.get(email="user@example.test")
        self.assertFalse(admin.is_staff or admin.is_superuser)
        self.assertTrue(admin.check_password("changed-admin-password"))
        self.assertFalse(user.is_staff or user.is_superuser)
        self.assertTrue(user.check_password("first-user-password"))

    def test_startup_survives_an_address_held_by_a_renamed_account(self):
        with patch.dict(os.environ, self.BOOTSTRAP_ADMIN_ONLY):
            call_command("setup_configured_users")
        renamed = User.objects.get(email="admin@example.test")
        renamed.email = "operator@example.test"
        renamed.save()

        with patch.dict(os.environ, self.BOOTSTRAP_ADMIN_ONLY):
            call_command("setup_configured_users")

        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(EmailAddress.objects.get().email, "admin@example.test")

    def test_startup_survives_a_renamed_sign_in_address(self):
        with patch.dict(os.environ, self.BOOTSTRAP_ADMIN_ONLY):
            call_command("setup_configured_users")
        EmailAddress.objects.filter(email="admin@example.test").update(
            email="operator@example.test"
        )

        with patch.dict(os.environ, self.BOOTSTRAP_ADMIN_ONLY):
            call_command("setup_configured_users")

        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(EmailAddress.objects.get().email, "operator@example.test")

    @override_settings(APP_ORIGIN="https://test.remdo.com")
    def test_render_accounts_use_the_service_origin_domain(self):
        with patch.dict(
            os.environ,
            {**self.BOOTSTRAP_ADMIN_ONLY, "RENDER": "true"},
        ):
            call_command("setup_configured_users")

        self.assertTrue(User.objects.filter(email="admin@test.remdo.com").exists())
        self.assertFalse(User.objects.filter(email="admin@example.test").exists())


@override_settings(
    ALLOWED_HOSTS=["testserver"], CSRF_TRUSTED_ORIGINS=["http://testserver"], DEBUG=True
)
class LoginPageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("alice@example.test", "alice-password-1234")

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def login(self, **fields):
        page = self.client.get("/accounts/login/")
        self.assertEqual(page.status_code, 200)
        return self.client.post(
            "/accounts/login/",
            {
                "login": self.user.email,
                "password": "alice-password-1234",
                "csrfmiddlewaretoken": self.client.cookies[settings.CSRF_COOKIE_NAME].value,
                **fields,
            },
        )

    def test_native_form_signs_in_and_completes_at_requested_document(self):
        response = self.login(next="/n/exampleDoc")
        self.assertTemplateUsed(response, "accounts/login_complete.html")
        self.assertEqual(response.context["next_url"], "/n/exampleDoc")
        self.assertIn("no-store", response.headers["Cache-Control"])
        session = self.client.get("/api/auth/browser/v1/auth/session").json()
        self.assertEqual(session["data"]["user"]["email"], self.user.email)

    def test_invalid_credentials_keep_the_form_without_completing_login(self):
        response = self.login(password="wrong")
        self.assertTemplateUsed(response, "accounts/login.html")
        self.assertTrue(response.context["form"].errors)
        self.assertNotContains(response, "localStorage.removeItem")
        self.assertEqual(self.client.get("/api/auth/browser/v1/auth/session").status_code, 401)

    @override_settings(ACCOUNT_SESSION_COOKIE_AGE=3600)
    def test_login_remembers_session_without_a_checkbox(self):
        page = self.client.get("/accounts/login/")
        self.assertNotContains(page, 'name="remember"')
        response = self.login()
        cookie = response.cookies[settings.SESSION_COOKIE_NAME]
        self.assertEqual(cookie["max-age"], 3600)
        self.assertTrue(cookie["expires"])
        self.assertFalse(self.client.session.get_expire_at_browser_close())

    def test_login_requires_csrf_and_rejects_untrusted_origins(self):
        self.assertEqual(self.client.post("/accounts/login/", {}).status_code, 403)
        self.client.get("/accounts/login/")
        response = self.client.post(
            "/accounts/login/",
            {
                "login": self.user.email,
                "password": "alice-password-1234",
                "csrfmiddlewaretoken": self.client.cookies[settings.CSRF_COOKIE_NAME].value,
            },
            HTTP_ORIGIN="http://unrelated.example",
        )
        self.assertEqual(response.status_code, 403)

    def test_an_existing_session_reaches_its_destination_without_completing_a_login(self):
        # The handoff clears this device's pending-sign-out marker, so only a
        # credentialed sign-in may render it; allauth redirects a visitor who
        # already has a session without asking for a password, which must not
        # supersede an unfinished logout.
        self.client.force_login(self.user, backend="django.contrib.auth.backends.ModelBackend")

        response = self.client.get("/accounts/login/?next=/n/exampleDoc")

        self.assertTemplateNotUsed(response, "accounts/login_complete.html")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/n/exampleDoc")

    def test_admin_logout_hands_off_before_revoking_the_session(self):
        self.user.is_staff = True
        self.user.save()
        self.login()
        response = self.client.post(
            "/admin/logout/",
            {"csrfmiddlewaretoken": self.client.cookies[settings.CSRF_COOKIE_NAME].value},
        )
        self.assertRedirects(response, "/sign-out/", fetch_redirect_response=False)
        self.assertIn("no-store", response.headers["Cache-Control"])
        # The browser must confirm discarded edits and clear local data first.
        self.assertEqual(self.client.get("/api/auth/browser/v1/auth/session").status_code, 200)

    def admin_login(self, **fields):
        response = self.client.get("/admin/login/", {"next": fields.pop("next", "/admin/")})
        self.assertEqual(response.status_code, 302)
        destination = urlsplit(response.url)
        self.assertEqual(destination.path, "/accounts/login/")
        return self.login(next=parse_qs(destination.query)["next"][0], **fields)

    def test_admin_login_completes_browser_handoff_with_safe_return_target(self):
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save()
        for target, expected in (
            ("/admin/accounts/user/", "/admin/accounts/user/"),
            ("https://unrelated.example/", "/admin/"),
        ):
            with self.subTest(target=target):
                self.client.logout()
                response = self.admin_login(next=target)
                self.assertTemplateUsed(response, "accounts/login_complete.html")
                destination = response.context["next_url"]
                self.assertFalse(urlsplit(destination).netloc)
                landed = self.client.get(destination, follow=True)
                self.assertEqual(landed.status_code, 200)
                self.assertEqual(landed.request["PATH_INFO"], expected)
                self.assertIn("no-store", response.headers["Cache-Control"])
                self.assertEqual(self.client.get("/admin/").status_code, 200)

    def test_admin_login_rejects_invalid_credentials_through_allauth(self):
        self.user.is_staff = True
        self.user.save()
        response = self.admin_login(password="wrong")
        self.assertTemplateUsed(response, "accounts/login.html")
        self.assertTrue(response.context["form"].errors)
        self.assertNotContains(response, "localStorage.removeItem")
        self.assertEqual(self.client.get("/api/auth/browser/v1/auth/session").status_code, 401)

    def test_admin_denies_nonstaff_without_ending_their_app_session(self):
        response = self.admin_login()
        self.assertTemplateUsed(response, "accounts/login_complete.html")
        self.assertEqual(self.client.get("/admin/", follow=True).status_code, 403)
        self.assertEqual(self.client.get("/admin/login/").status_code, 403)
        self.assertEqual(self.client.get("/api/auth/browser/v1/auth/session").status_code, 200)

    def test_admin_entry_cannot_switch_an_authenticated_staff_session(self):
        self.user.is_staff = True
        self.user.save()
        other = User.objects.create_superuser("other@example.test", "other-password-1234")
        self.login()
        response = self.client.post(
            "/admin/login/",
            {
                "username": other.email,
                "password": "other-password-1234",
                "csrfmiddlewaretoken": self.client.cookies[settings.CSRF_COOKIE_NAME].value,
            },
        )
        self.assertEqual(response.status_code, 405)
        session = self.client.get("/api/auth/browser/v1/auth/session").json()
        self.assertEqual(session["data"]["user"]["email"], self.user.email)

    @override_settings(ACCOUNT_RATE_LIMITS={"login_failed": "2/m/key", "login": "100/m/ip"})
    @patch("time.time", return_value=1_700_000_000)
    def test_admin_login_uses_the_shared_allauth_failure_limit(self, _time):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user.is_staff = True
        self.user.save()
        for expected in (
            "email_password_mismatch",
            "email_password_mismatch",
            "too_many_login_attempts",
        ):
            response = self.admin_login(password="wrong")
            errors = response.context["form"].non_field_errors().as_data()
            self.assertEqual([error.code for error in errors], [expected])
        response = self.admin_login()
        errors = response.context["form"].non_field_errors().as_data()
        self.assertEqual([error.code for error in errors], ["too_many_login_attempts"])
        self.assertEqual(self.client.get("/api/auth/browser/v1/auth/session").status_code, 401)

    def test_admin_login_handoff_requires_csrf(self):
        self.assertEqual(self.client.post("/admin/login/", {}).status_code, 403)

    def test_admin_logout_handoff_requires_a_csrf_protected_post(self):
        self.login()
        self.assertEqual(self.client.get("/admin/logout/").status_code, 405)
        self.assertEqual(self.client.post("/admin/logout/", {}).status_code, 403)
        response = self.client.post(
            "/admin/logout/",
            {"csrfmiddlewaretoken": self.client.cookies[settings.CSRF_COOKIE_NAME].value},
            HTTP_ORIGIN="http://unrelated.example",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get("/api/auth/browser/v1/auth/session").status_code, 200)

    def test_external_return_url_is_rejected(self):
        response = self.login(next="https://unrelated.example/")
        self.assertEqual(response.context["next_url"], "/")

    def test_unscoped_account_features_are_not_routed(self):
        for path in ("signup", "logout", "password/reset"):
            self.assertEqual(self.client.get(f"/accounts/{path}/").status_code, 404)

    def test_account_cannot_rewrite_its_sharing_identity(self):
        self.login()
        for method in (self.client.post, self.client.patch):
            response = method(
                "/api/auth/browser/v1/account/email",
                json.dumps({"email": "someone-else@example.test", "primary": True}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=self.client.cookies[settings.CSRF_COOKIE_NAME].value,
            )
            self.assertEqual(response.status_code, 404)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "alice@example.test")
        self.assertFalse(EmailAddress.objects.filter(email="someone-else@example.test").exists())

    def test_inactive_account_cannot_sign_in_through_native_or_headless_login(self):
        self.user.is_active = False
        self.user.save()
        response = self.login()
        self.assertRedirects(response, "/accounts/inactive/")
        self.assertContains(self.client.get("/accounts/inactive/"), "This account is inactive.")
        response = self.client.post(
            "/api/auth/browser/v1/auth/login",
            json.dumps({"email": self.user.email, "password": "alice-password-1234"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.client.cookies[settings.CSRF_COOKIE_NAME].value,
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.client.get("/api/auth/browser/v1/auth/session").status_code, 401)

    def test_built_frontend_uses_manifest_styles_even_with_django_debug(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory) / "manifest.json"
            manifest.write_text(
                json.dumps(
                    {
                        "src/client/ui/styles/shared.css": {
                            "file": "app-assets/shared-test.js",
                            "css": ["app-assets/shared-test.css"],
                        }
                    }
                )
            )
            with override_settings(FRONTEND_USE_SOURCE=False, FRONTEND_MANIFEST=manifest):
                response = self.client.get("/accounts/login/")
        self.assertContains(response, 'href="/app-assets/shared-test.css"')
        self.assertNotContains(response, "<script")
        self.assertContains(response, 'autocomplete="current-password"')


@override_settings(
    ALLOWED_HOSTS=["testserver"], CSRF_TRUSTED_ORIGINS=["http://testserver"], DEBUG=True
)
class GoogleLoginTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def start_google_login(self, next_url="/n/exampleDoc"):
        self.client.get("/accounts/login/")
        start = self.client.post(
            "/accounts/google/login/",
            {
                "next": next_url,
                "csrfmiddlewaretoken": self.client.cookies[settings.CSRF_COOKIE_NAME].value,
            },
        )
        self.assertEqual(start.status_code, 302)
        authorization = parse_qs(urlsplit(start["Location"]).query)
        self.assertEqual(set(authorization["scope"][0].split()), {"openid", "email", "profile"})
        return authorization["state"][0]

    def google_login(self, email, email_verified=True, next_url="/n/exampleDoc"):
        state = self.start_google_login(next_url)
        claims = {
            "sub": f"google-{email.lower()}",
            "email": email,
            "email_verified": email_verified,
        }
        token = {"access_token": "access", "refresh_token": "refresh", "id_token": "id"}
        with (
            patch.object(GoogleOAuth2Adapter, "get_access_token_data", return_value=token),
            patch.object(GoogleOAuth2Adapter, "_decode_id_token", return_value=claims),
        ):
            return self.client.get(
                "/accounts/google/login/callback/",
                {"code": "code", "state": state},
            )

    def session_email(self):
        session = self.client.get("/api/auth/browser/v1/auth/session")
        return session.json()["data"]["user"]["email"] if session.status_code == 200 else None

    def test_sign_in_entries_offer_google(self):
        for path in ("/", "/accounts/login/?next=/n/exampleDoc"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertContains(response, 'action="/accounts/google/login/"')
                self.assertContains(response, "Sign in with Google")
        self.assertContains(response, 'name="next" value="/n/exampleDoc"')

    def test_new_verified_google_user_registers_without_stored_tokens(self):
        response = self.google_login("New@Example.test")

        self.assertTemplateUsed(response, "accounts/login_complete.html")
        self.assertEqual(response.context["next_url"], "/n/exampleDoc")
        user = User.objects.get(email="new@example.test")
        self.assertEqual(self.session_email(), user.email)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(list(user.document_set.values_list("title", flat=True)), ["New Document"])
        self.assertEqual(SocialAccount.objects.get().user, user)
        self.assertFalse(SocialToken.objects.exists())

    def test_matching_verified_email_signs_in_to_the_existing_account(self):
        user = User.objects.create_user("alice@example.test", "alice-password-1234")

        self.google_login("Alice@Example.test")

        self.assertEqual(self.session_email(), user.email)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(SocialAccount.objects.get().user, user)
        user.refresh_from_db()
        self.assertTrue(user.check_password("alice-password-1234"))

        self.client.logout()
        self.google_login("alice@example.test")
        self.assertEqual(self.session_email(), user.email)
        self.assertEqual(SocialAccount.objects.count(), 1)

    def test_unverified_google_email_neither_registers_nor_matches(self):
        User.objects.create_user("alice@example.test", "alice-password-1234")
        for email in ("new@example.test", "alice@example.test"):
            with self.subTest(email=email):
                response = self.google_login(email, email_verified=False)
                self.assertContains(response, "Google sign-in unavailable")
                self.assertIsNone(self.session_email())
        self.assertEqual(User.objects.count(), 1)
        self.assertFalse(SocialAccount.objects.exists())

    def test_staff_accounts_are_not_linked_by_email(self):
        for email, role in (
            ("staff@example.test", {"is_staff": True}),
            ("root@example.test", {"is_superuser": True}),
        ):
            with self.subTest(email=email):
                User.objects.create_user(email, "staff-password-1234", **role)
                response = self.google_login(email)
                self.assertContains(response, "Google sign-in unavailable")
                self.assertIsNone(self.session_email())
                self.assertTrue(User.objects.get(email=email).check_password("staff-password-1234"))
        self.assertEqual(User.objects.count(), 2)
        self.assertFalse(SocialAccount.objects.exists())

    def test_linked_account_promoted_to_staff_stops_signing_in_with_google(self):
        self.google_login("promoted@example.test")
        user = User.objects.get(email="promoted@example.test")
        user.is_staff = True
        user.save()
        self.client.logout()

        response = self.google_login("promoted@example.test")

        self.assertContains(response, "Google sign-in unavailable")
        self.assertIsNone(self.session_email())

    def test_external_return_url_is_rejected(self):
        response = self.google_login("new@example.test", next_url="https://unrelated.example/")
        self.assertEqual(response.context["next_url"], "/")

    def test_only_google_sign_in_routes_are_mounted(self):
        for path in ("social/connections/", "social/signup/", "google/login/token/"):
            self.assertEqual(self.client.get(f"/accounts/{path}").status_code, 404)

    def test_cancelled_google_sign_in_offers_sign_in_again(self):
        response = self.client.get(
            "/accounts/google/login/callback/",
            {"error": "access_denied", "state": self.start_google_login()},
            follow=True,
        )
        self.assertContains(response, 'href="/accounts/login/"')
        self.assertIsNone(self.session_email())
