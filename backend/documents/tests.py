import io
import json
import os
from unittest.mock import patch

from accounts.models import User
from allauth.account.models import EmailAddress
from django.conf import settings
from django.core.management import call_command
from django.test import Client, SimpleTestCase, TestCase, override_settings

from .models import Document, DocumentGrant


class ConfigurationTests(SimpleTestCase):
    def test_public_configuration_identifies_running_build(self):
        for revision in ("0123456789abcdef0123456789abcdef01234567", ""):
            with self.subTest(revision=revision), override_settings(BUILD_REVISION=revision):
                response = self.client.get("/api/config")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["buildRevision"], revision)
                self.assertIn("no-store", response.headers["Cache-Control"])


@override_settings(ALLOWED_HOSTS=["testserver"], CSRF_TRUSTED_ORIGINS=["http://testserver"])
class DocumentFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@example.test", "Owner-password-123")
        cls.other = User.objects.create_user("other@example.test", "Other-password-123")
        for user in (cls.owner, cls.other):
            EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def send(self, method, path, body=None, **headers):
        token = self.client.get("/api/config").json()["csrfToken"]
        return getattr(self.client, method)(
            path,
            json.dumps(body or {}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
            **headers,
        )

    def post(self, path, body=None, **headers):
        return self.send("post", path, body, **headers)

    def put(self, path, body=None, **headers):
        return self.send("put", path, body, **headers)

    def authorize(self, document_id):
        return self.client.get(
            f"/internal/collaboration/documents/{document_id}/authorize",
            HTTP_X_REMDO_COLLABORATION_SECRET=settings.COLLAB_INTERNAL_SECRET,
            HTTP_ORIGIN="http://testserver",
        )

    def sign_out(self):
        token = self.client.get("/api/config").json()["csrfToken"]
        return self.client.delete("/api/auth/browser/v1/auth/session", HTTP_X_CSRFTOKEN=token)

    def sign_in(self, email="owner@example.test", password="Owner-password-123"):
        response = self.post(
            "/api/auth/browser/v1/auth/login", {"email": email, "password": password}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["user"]["email"], email.lower())
        return response

    def test_sign_in_bootstrap_create_list_and_reopen(self):
        self.sign_in()
        bootstrap = self.client.get("/api/current-user").json()
        self.assertEqual(bootstrap, {"userId": str(self.owner.pk)})
        self.assertEqual(self.client.get("/api/current-user").json(), bootstrap)
        response = self.post("/api/documents", {"title": "Research"})
        self.assertEqual(response.status_code, 201)
        document = response.json()
        self.assertRegex(document["id"], r"^[A-Za-z0-9]{20}$")
        self.assertIn(document, self.client.get("/api/documents").json())
        # A fresh HTTP client reads durable sessions and metadata, not process-local state.
        reopened = Client()
        reopened.cookies = self.client.cookies.copy()
        self.assertIn(document, reopened.get("/api/documents").json())
        self.assertEqual(Document.objects.filter(owner=self.owner).count(), 2)

    def test_another_account_cannot_list_or_access_documents(self):
        document = Document.objects.create(owner=self.owner, title="Private")
        self.sign_in("other@example.test", "Other-password-123")
        self.assertEqual(
            [item["id"] for item in self.client.get("/api/documents").json()],
            [Document.objects.get(owner=self.other).id],
        )
        self.assertEqual(self.authorize(document.id).status_code, 403)
        self.assertEqual(self.authorize("unknown").status_code, 404)

    def test_owner_shares_with_existing_account_and_grant_is_idempotent(self):
        document = Document.objects.get(owner=self.owner)
        private = Document.objects.create(owner=self.owner, title="Private research")
        self.sign_in()
        path = f"/api/documents/{document.id}/access"
        response = self.post(path, {"email": " OTHER@EXAMPLE.TEST "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["granteeUserId"], str(self.other.pk))
        self.assertEqual(response.json()["documentId"], document.id)
        self.assertEqual(self.post(path, {"email": self.other.email}).json(), response.json())
        self.assertEqual(DocumentGrant.objects.count(), 1)
        listing = self.client.get("/api/documents").json()
        shared = next(item for item in listing if item["id"] == document.id)
        self.assertTrue(shared["shareable"])
        self.assertEqual(shared["access"], [response.json()])
        self.sign_out()
        self.sign_in(self.other.email, "Other-password-123")
        listing = self.client.get("/api/documents").json()
        self.assertCountEqual(
            [item["id"] for item in listing],
            [Document.objects.get(owner=self.other).id, document.id],
        )
        self.assertFalse(next(item for item in listing if item["id"] == document.id)["shareable"])
        self.assertEqual(self.authorize(document.id).status_code, 200)
        self.assertEqual(self.authorize(private.id).status_code, 403)

    def test_only_owner_receives_recipient_details(self):
        document = Document.objects.create(owner=self.owner)
        third = User.objects.create_user("third@example.test")
        for recipient in (self.other, third):
            DocumentGrant.objects.create(document=document, user=recipient)
        self.client.force_login(self.owner, backend="django.contrib.auth.backends.ModelBackend")
        listing = self.client.get("/api/documents").json()
        self.assertCountEqual(
            [item["id"] for item in listing],
            list(Document.objects.filter(owner=self.owner).values_list("id", flat=True)),
        )
        shared = next(item for item in listing if item["id"] == document.id)
        self.assertCountEqual(
            [grant["email"] for grant in shared["access"]], [self.other.email, third.email]
        )
        for recipient in (self.other, third):
            with self.subTest(recipient=recipient.email):
                self.client.force_login(
                    recipient, backend="django.contrib.auth.backends.ModelBackend"
                )
                listing = self.client.get("/api/documents").json()
                self.assertCountEqual(
                    [item["id"] for item in listing],
                    [Document.objects.get(owner=recipient).id, document.id],
                )
                self.assertTrue(all(item["access"] == [] for item in listing))

    def test_sharing_rejects_unknown_self_and_invalid_email(self):
        document = Document.objects.create(owner=self.owner)
        self.sign_in()
        for email in ("missing@example.test", self.owner.email, "invalid"):
            with self.subTest(email=email):
                response = self.post(f"/api/documents/{document.id}/access", {"email": email})
                self.assertEqual(response.status_code, 400)
        self.assertFalse(DocumentGrant.objects.exists())

    def test_owner_and_grantee_rename_the_document(self):
        document = Document.objects.create(owner=self.owner, title="Draft")
        DocumentGrant.objects.create(document=document, user=self.other)
        path = f"/api/documents/{document.id}"

        self.sign_in()
        response = self.put(path, {"title": "  Quarterly  plan  "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "Quarterly  plan")
        self.sign_out()

        self.sign_in(self.other.email, "Other-password-123")
        self.assertEqual(self.put(path, {"title": "Grantee name"}).status_code, 200)
        document.refresh_from_db()
        self.assertEqual(document.title, "Grantee name")

    def test_rename_rejects_an_empty_name_and_an_inaccessible_document(self):
        document = Document.objects.create(owner=self.owner, title="Draft")
        unreachable = Document.objects.create(owner=self.other, title="Theirs")
        self.sign_in()

        self.assertEqual(
            self.put(f"/api/documents/{document.id}", {"title": "   "}).status_code, 400
        )
        self.assertEqual(
            self.put(f"/api/documents/{unreachable.id}", {"title": "Taken"}).status_code, 404
        )

        document.refresh_from_db()
        unreachable.refresh_from_db()
        self.assertEqual(document.title, "Draft")
        self.assertEqual(unreachable.title, "Theirs")

    def test_only_owner_can_grant_access_even_if_recipient_or_admin(self):
        document = Document.objects.create(owner=self.owner)
        DocumentGrant.objects.create(document=document, user=self.other)
        self.other.is_staff = self.other.is_superuser = True
        self.other.save()
        self.sign_in(self.other.email, "Other-password-123")
        self.assertEqual(
            self.post(
                f"/api/documents/{document.id}/access", {"email": self.owner.email}
            ).status_code,
            403,
        )
        self.assertEqual(DocumentGrant.objects.count(), 1)
        self.sign_out()
        self.assertEqual(
            self.post(
                f"/api/documents/{document.id}/access", {"email": self.other.email}
            ).status_code,
            403,
        )

    def test_grants_require_csrf_and_do_not_expose_document_to_unrelated_account(self):
        document = Document.objects.create(owner=self.owner)
        self.sign_in()
        self.assertEqual(
            self.client.post(
                f"/api/documents/{document.id}/access",
                {"email": self.other.email},
                content_type="application/json",
            ).status_code,
            403,
        )
        self.assertFalse(DocumentGrant.objects.exists())
        self.post(f"/api/documents/{document.id}/access", {"email": self.other.email})
        stranger = User.objects.create_user("stranger@example.test")
        self.client.force_login(stranger, backend="django.contrib.auth.backends.ModelBackend")
        self.assertEqual(
            [item["id"] for item in self.client.get("/api/documents").json()],
            [Document.objects.get(owner=stranger).id],
        )
        self.assertEqual(self.authorize(document.id).status_code, 403)
        self.assertEqual(
            self.post(
                f"/api/documents/{document.id}/access", {"email": self.other.email}
            ).status_code,
            403,
        )

    def test_signed_out_requests_do_not_reach_collaboration(self):
        document = Document.objects.create(owner=self.owner, title="Private")
        self.assertEqual(self.client.get("/api/current-user").status_code, 403)
        self.assertEqual(self.client.get("/api/documents").status_code, 403)
        self.assertEqual(self.post("/api/documents", {"title": "No"}).status_code, 403)
        self.assertEqual(self.authorize(document.id).status_code, 403)

    def test_logout_revokes_session_and_does_not_expose_other_user(self):
        self.sign_in()
        previous_session = self.client.cookies[settings.SESSION_COOKIE_NAME].value
        self.assertEqual(self.sign_out().status_code, 401)
        self.assertFalse(
            self.client.get("/api/auth/browser/v1/auth/session").json()["meta"]["is_authenticated"]
        )
        old_client = Client()
        old_client.cookies[settings.SESSION_COOKIE_NAME] = previous_session
        self.assertEqual(old_client.get("/api/documents").status_code, 403)
        self.sign_in("other@example.test", "Other-password-123")
        self.assertEqual(
            self.client.get("/api/auth/browser/v1/auth/session").json()["data"]["user"]["id"],
            self.other.pk,
        )

    def test_login_and_document_mutations_enforce_csrf(self):
        self.assertEqual(
            self.client.post(
                "/api/auth/browser/v1/auth/login", {}, content_type="application/json"
            ).status_code,
            403,
        )
        self.assertEqual(
            self.post(
                "/api/auth/browser/v1/auth/login",
                {"email": self.owner.email, "password": "Owner-password-123"},
                HTTP_ORIGIN="https://untrusted.test",
            ).status_code,
            403,
        )
        self.sign_in()
        self.assertEqual(self.client.delete("/api/auth/browser/v1/auth/session").status_code, 403)
        self.assertEqual(self.client.get("/api/auth/browser/v1/auth/session").status_code, 200)
        self.assertEqual(
            self.post(
                "/api/documents", {"title": "Bad"}, HTTP_ORIGIN="https://untrusted.test"
            ).status_code,
            403,
        )
        self.assertFalse(Document.objects.filter(title="Bad").exists())
        self.assertEqual(
            self.post(
                "/api/documents", {"title": "Good"}, HTTP_ORIGIN="http://testserver"
            ).status_code,
            201,
        )

    def test_invalid_password_and_title_do_not_mutate_state(self):
        self.assertEqual(
            self.post(
                "/api/auth/browser/v1/auth/login", {"email": self.owner.email, "password": "wrong"}
            ).status_code,
            400,
        )
        self.sign_in()
        self.assertEqual(self.post("/api/documents", {"title": []}).status_code, 400)
        self.assertEqual(self.post("/api/documents", {"title": "a" * 501}).status_code, 400)
        token = self.client.get("/api/config").json()["csrfToken"]
        for body, content_type, expected in [
            ("{", "application/json", 400),
            ("[]", "application/json", 400),
            ("title=Invalid", "application/x-www-form-urlencoded", 415),
        ]:
            with self.subTest(body=body):
                response = self.client.post(
                    "/api/documents", body, content_type=content_type, HTTP_X_CSRFTOKEN=token
                )
                self.assertEqual(response.status_code, expected)
        self.assertEqual(Document.objects.count(), 2)

    def test_admin_requires_staff_and_exposes_django_models(self):
        self.sign_in()
        self.assertEqual(self.client.get("/admin/").status_code, 302)
        self.sign_out()
        with patch.dict(os.environ, {"DJANGO_SUPERUSER_PASSWORD": "Admin-password-123"}):
            call_command(
                "createsuperuser",
                email="Admin@Example.test",
                interactive=False,
                stdout=io.StringIO(),
            )
        self.assertEqual(
            Document.objects.get(owner__email="admin@example.test").title, "New Document"
        )
        self.sign_in("admin@example.test", "Admin-password-123")
        self.assertEqual(self.client.get("/admin/").status_code, 200)
        self.assertTrue(
            self.client.get("/api/auth/browser/v1/auth/session").json()["data"]["user"]["is_staff"]
        )
        other_document = Document.objects.create(owner=self.other)
        self.assertEqual(self.authorize(other_document.id).status_code, 403)
        self.assertEqual(self.client.get("/admin/accounts/user/add/").status_code, 200)
        self.assertEqual(self.client.get("/admin/documents/document/").status_code, 200)
        token = self.client.get("/api/config").json()["csrfToken"]
        response = self.client.post(
            "/admin/accounts/user/add/",
            {
                "email": "Created@Example.test",
                "password1": "Created-account-password-123",
                "password2": "Created-account-password-123",
                "csrfmiddlewaretoken": token,
            },
        )
        self.assertEqual(response.status_code, 302)
        self.sign_out()
        self.sign_in("created@example.test", "Created-account-password-123")
        self.assertEqual(
            Document.objects.get(owner__email="created@example.test").title, "New Document"
        )

    def test_private_signup_is_not_enabled_by_installing_allauth(self):
        response = self.post(
            "/api/auth/browser/v1/auth/signup",
            {"email": "new@example.test", "password": "New-account-password-123"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertFalse(User.objects.filter(email="new@example.test").exists())
        flows = self.client.get("/api/auth/browser/v1/auth/session").json()["data"]["flows"]
        self.assertNotIn({"id": "signup"}, flows)

    def test_fixture_setup_creates_metadata_and_reset_preserves_unrelated_accounts(self):
        title = '-- Research "notes" & ideas'
        output = io.StringIO()
        call_command(
            "create_fixture_documents",
            json.dumps(
                [
                    {"email": self.owner.email, "id": "fixtureDoc", "title": title},
                    {"email": self.other.email, "title": "Other fixture"},
                ]
            ),
            stdout=output,
        )
        ids = json.loads(output.getvalue())
        self.assertEqual(len(ids), 2)
        self.assertEqual(ids[0], "fixtureDoc")
        other_fixture = Document.objects.get(pk=ids[1])
        self.assertEqual(other_fixture.owner, self.other)
        self.assertEqual(other_fixture.title, "Other fixture")
        document = Document.objects.get(pk="fixtureDoc")
        self.assertEqual(document.title, title)
        self.assertEqual(document.owner, self.owner)
        unrelated = Document.objects.create(owner=self.other, title="Keep")
        self.sign_in()
        call_command("reset_fixture_users", "--email", self.owner.email)
        self.assertFalse(User.objects.filter(pk=self.owner.pk).exists())
        self.assertFalse(Document.objects.filter(pk=document.pk).exists())
        self.assertTrue(Document.objects.filter(pk=unrelated.pk, owner=self.other).exists())
        self.assertEqual(self.client.get("/api/current-user").status_code, 403)

    def test_provisioned_account_uses_allauth_identity_and_keeps_existing_credentials(self):
        call_command(
            "provision_user",
            "--email=Provisioned@Example.test",
            "--password=Provisioned-password-123",
            "--name=Provisioned",
            "--admin",
        )
        user = User.objects.get(email="provisioned@example.test")
        self.assertTrue(
            EmailAddress.objects.filter(user=user, primary=True, verified=True).exists()
        )
        self.assertEqual(user.first_name, "Provisioned")
        call_command(
            "provision_user",
            "--email=provisioned@example.test",
            "--password=Replacement-password-123",
        )
        user.refresh_from_db()
        self.assertEqual(user.first_name, "Provisioned")
        response = self.sign_in("provisioned@example.test", "Provisioned-password-123")
        self.assertTrue(response.json()["data"]["user"]["is_staff"])


class StarterDocumentTests(TestCase):
    def test_account_creation_supplies_one_document_and_updates_preserve_it(self):
        user = User.objects.create_user("starter@example.test", "password")
        document = Document.objects.get(owner=user)
        self.assertEqual(document.title, "New Document")
        self.assertFalse(document.grants.exists())
        user.first_name = "Changed"
        user.save()
        self.assertEqual(list(Document.objects.filter(owner=user)), [document])

    def test_saving_reconstructed_account_preserves_document_inventory(self):
        user = User.objects.create_user("reconstructed@example.test", "password")
        document = Document.objects.get(owner=user)
        User(pk=user.pk, email=user.email, password=user.password, first_name="Changed").save()
        user.refresh_from_db()
        self.assertEqual(user.first_name, "Changed")
        self.assertEqual(list(Document.objects.filter(owner=user)), [document])

    def test_failed_document_creation_rolls_back_account(self):
        with patch(
            "django.db.models.query.QuerySet.create", side_effect=RuntimeError("unavailable")
        ):
            with self.assertRaisesMessage(RuntimeError, "unavailable"):
                User.objects.create_user("failed@example.test", "password")
        self.assertFalse(User.objects.filter(email="failed@example.test").exists())

    def test_reads_and_sign_in_preserve_an_empty_workspace(self):
        user = User.objects.create_user("empty@example.test", "password")
        Document.objects.filter(owner=user).delete()
        self.client.force_login(user, backend="django.contrib.auth.backends.ModelBackend")
        for _ in range(2):
            self.assertEqual(
                self.client.get("/api/current-user").json(),
                {"userId": str(user.pk)},
            )
            self.assertEqual(self.client.get("/api/documents").json(), [])
        self.assertFalse(Document.objects.filter(owner=user).exists())

    def test_fixture_provisioning_creates_once_and_preserves_empty_workspace(self):
        for _ in range(2):
            call_command("provision_user", email="fixture@example.test", password="password")
        user = User.objects.get(email="fixture@example.test")
        self.assertEqual(Document.objects.get(owner=user).title, "New Document")
        Document.objects.filter(owner=user).delete()
        call_command("provision_user", email=user.email, password="password")
        self.assertFalse(Document.objects.filter(owner=user).exists())
