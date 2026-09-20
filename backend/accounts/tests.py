import json
import tempfile
from pathlib import Path

from allauth.account.models import EmailAddress
from django.conf import settings
from django.test import Client, TestCase, override_settings

from .models import User


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

    def test_existing_admin_session_completes_login_without_a_second_form(self):
        self.client.force_login(self.user, backend="django.contrib.auth.backends.ModelBackend")
        response = self.client.get("/accounts/login/?next=/n/exampleDoc")
        self.assertTemplateUsed(response, "accounts/login_complete.html")
        self.assertEqual(response.context["next_url"], "/n/exampleDoc")

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
            with override_settings(FRONTEND_USE_SOURCE_STYLES=False, FRONTEND_MANIFEST=manifest):
                response = self.client.get("/accounts/login/")
        self.assertContains(response, 'href="/app-assets/shared-test.css"')
        self.assertNotContains(response, "<script")
        self.assertContains(response, 'autocomplete="current-password"')
