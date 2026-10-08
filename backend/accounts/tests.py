import json
import os
import re
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount, SocialToken
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.urls import path as route
from documents.models import Document
from remdo.base import EMAIL_SIGNUP_SETTINGS

from .models import User
from .views import LoginView


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

    def test_provisioning_leaves_an_account_created_after_its_check_unverified(self):
        pending = User.objects.create_user("admin@example.test")
        with (
            patch.dict(os.environ, self.BOOTSTRAP_ADMIN_ONLY),
            patch.object(User.objects, "filter", return_value=Mock(exists=lambda: False)),
        ):
            call_command("setup_configured_users")

        self.assertFalse(EmailAddress.objects.filter(user=pending).exists())
        self.assertFalse(pending.check_password("first-admin-password"))

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


class NoGoogleLoginUrls:
    urlpatterns = [route("accounts/login/", LoginView.as_view(), name="account_login")]


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

    def test_page_says_that_signing_in_means_agreeing_to_the_privacy_policy_and_terms(self):
        page = self.client.get("/accounts/login/")
        self.assertContains(page, "By signing in you agree to the")
        self.assertContains(page, 'href="/privacy/"')
        self.assertContains(page, 'href="/terms/"')

    def test_page_offers_google_before_the_password_form(self):
        content = self.client.get("/accounts/login/").content.decode()
        self.assertRegex(content, r'(?s)Sign in with Google.*?>\s*or\s*<.*?name="login"')

    @override_settings(ROOT_URLCONF=NoGoogleLoginUrls)
    def test_page_shows_only_the_password_form_when_google_is_unconfigured(self):
        response = self.client.get("/accounts/login/")
        self.assertContains(response, 'name="login"')
        self.assertNotContains(response, "Sign in with Google")
        self.assertNotRegex(response.content.decode(), r">\s*or\s*<")

    def test_page_keeps_the_requested_destination_in_its_link_and_forms(self):
        response = self.client.get("/accounts/login/?next=/n/exampleDoc")
        self.assertContains(
            response,
            '<a href="/accounts/login/?next=/n/exampleDoc" aria-current="page">Sign in</a>',
            html=True,
        )
        self.assertContains(
            response, '<input type="hidden" name="next" value="/n/exampleDoc">', html=True, count=2
        )

    def test_page_links_the_site_header_and_footer(self):
        response = self.client.get("/accounts/login/")
        self.assertContains(response, '<a href="/about/">About</a>', html=True)
        self.assertContains(response, '<a href="/privacy/">Privacy</a>', html=True)
        self.assertContains(response, '<a href="/terms/">Terms</a>', html=True)
        self.assertContains(
            response,
            '<a href="https://github.com/remdo-project/remdo" target="_blank" rel="noreferrer">Source</a>',
            html=True,
        )

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
                        },
                        "src/client/ui/styles/site.css": {
                            "file": "app-assets/site-test.css",
                            "isEntry": True,
                        },
                    }
                )
            )
            with override_settings(FRONTEND_USE_SOURCE=False, FRONTEND_MANIFEST=manifest):
                response = self.client.get("/accounts/login/")
        content = response.content.decode()
        self.assertContains(response, 'href="/app-assets/shared-test.css"')
        self.assertLess(
            content.index("/app-assets/shared-test.css"), content.index("/app-assets/site-test.css")
        )
        self.assertNotContains(response, "<script")
        self.assertContains(response, 'autocomplete="current-password"')


class SessionEmailMixin:
    def session_email(self):
        session = self.client.get("/api/auth/browser/v1/auth/session")
        return session.json()["data"]["user"]["email"] if session.status_code == 200 else None


@override_settings(
    ALLOWED_HOSTS=["testserver"], CSRF_TRUSTED_ORIGINS=["http://testserver"], DEBUG=True
)
class GoogleLoginTests(SessionEmailMixin, TestCase):
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

    @override_settings(**EMAIL_SIGNUP_SETTINGS)
    def test_google_signs_in_to_an_unconfirmed_signup_without_a_code_step(self):
        user = User.objects.create_user("alice@example.test")
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=False)

        self.google_login("alice@example.test")

        self.assertEqual(self.session_email(), user.email)

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
        self.assertContains(response, "?method=password&amp;next=/n/exampleDoc")
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


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    CSRF_TRUSTED_ORIGINS=["http://testserver"],
    DEBUG=True,
    **EMAIL_SIGNUP_SETTINGS,
)
class EmailSignInTests(SessionEmailMixin, TestCase):
    PASSWORD = "alice-password-1234"

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.client.get("/accounts/login/")

    def post(self, path, data):
        token = self.client.cookies[settings.CSRF_COOKIE_NAME].value
        return self.client.post(path, {**data, "csrfmiddlewaretoken": token})

    def account(self, email="alice@example.test", **fields):
        user = User.objects.create_user(email, self.PASSWORD, **fields)
        EmailAddress.objects.create(user=user, email=email, primary=True, verified=True)
        return user

    def emailed_code(self):
        return re.search(r"\b[A-Z0-9]{4}-[A-Z0-9]{4}\b", mail.outbox[-1].body).group()

    def test_new_address_gets_a_passwordless_account_once_its_code_is_confirmed(self):
        response = self.post("/accounts/email/", {"email": "new@example.test"})
        self.assertEqual(response["Location"], "/accounts/confirm-email/")
        self.assertIsNone(self.session_email())

        response = self.post("/accounts/confirm-email/", {"code": self.emailed_code()})

        self.assertTemplateUsed(response, "accounts/login_complete.html")
        self.assertEqual(self.session_email(), "new@example.test")
        user = User.objects.get(email="new@example.test")
        self.assertFalse(user.has_usable_password())
        self.assertEqual(Document.objects.get(owner=user).title, "New Document")

    def test_signup_never_stores_a_submitted_password(self):
        self.post(
            "/accounts/email/",
            {"email": "new@example.test", "password1": "attacker-password-9"},
        )
        self.post("/accounts/confirm-email/", {"code": self.emailed_code()})

        user = User.objects.get(email="new@example.test")
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.check_password("attacker-password-9"))

    def test_existing_account_signs_in_with_a_code_and_next_destination(self):
        self.account()

        response = self.post("/accounts/email/", {"email": "Alice@Example.test", "next": "/n/doc"})
        self.assertTrue(response["Location"].startswith("/accounts/login/code/confirm/"))
        response = self.post(response["Location"], {"code": self.emailed_code()})

        self.assertEqual(response.context["next_url"], "/n/doc")
        self.assertEqual(self.session_email(), "alice@example.test")
        self.assertEqual(User.objects.count(), 1)

    def test_administrator_cannot_sign_in_with_a_code_but_can_with_a_password(self):
        self.account(is_staff=True)

        response = self.post("/accounts/email/", {"email": "alice@example.test", "next": "/admin/"})
        response = self.post(response["Location"], {"code": self.emailed_code()})

        self.assertTemplateUsed(response, "account/password_only.html")
        self.assertContains(response, "?method=password&amp;next=/admin/")
        self.assertContains(response, "needs an operator to set one")
        self.assertNotContains(response, "Successfully signed in")
        self.assertIn("no-store", response["Cache-Control"])
        self.assertIsNone(User.objects.get(email="alice@example.test").last_login)
        self.assertNotIn("account_login", self.client.session)
        self.assertNotIn("account_authentication_methods", self.client.session)
        self.assertIsNone(self.session_email())
        response = self.post(
            "/accounts/login/?method=password",
            {"login": "alice@example.test", "password": self.PASSWORD},
        )
        self.assertTemplateUsed(response, "accounts/login_complete.html")
        self.assertEqual(self.session_email(), "alice@example.test")

    def test_confirmation_can_be_cancelled_to_start_over(self):
        self.post("/accounts/email/", {"email": "new@example.test"})
        page = self.client.get("/accounts/confirm-email/")
        self.assertContains(page, 'action="/accounts/logout/"')

        response = self.post("/accounts/logout/", {})

        self.assertEqual(response["Location"], "/accounts/login/")
        self.assertEqual(self.client.get("/accounts/login/").status_code, 200)

    def test_signing_up_a_known_address_sends_a_sign_in_pointer_not_a_password_reset(self):
        self.account()

        response = self.post("/accounts/signup/", {"email": "alice@example.test"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(mail.outbox[-1].subject, "[testserver] Account Already Exists")
        self.assertIn(f"{settings.APP_ORIGIN}/accounts/login/", mail.outbox[-1].body)
        self.assertNotIn("password", mail.outbox[-1].body.lower())
        self.assertEqual(User.objects.count(), 1)

    def test_login_code_page_renders_for_a_known_address(self):
        self.account()
        self.post("/accounts/email/", {"email": "alice@example.test"})
        page = self.client.get("/accounts/login/code/confirm/")
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "Request new code")

    def test_command_line_superuser_signs_in_with_its_password(self):
        User.objects.create_superuser("root@example.test", self.PASSWORD)

        response = self.post(
            "/accounts/login/?method=password",
            {"login": "root@example.test", "password": self.PASSWORD},
        )

        self.assertTemplateUsed(response, "accounts/login_complete.html")

    def test_administrator_with_an_unverified_address_verifies_it_after_the_password(self):
        user = User.objects.create_user("alice@example.test", self.PASSWORD, is_staff=True)
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=False)

        response = self.post(
            "/accounts/login/?method=password",
            {"login": "alice@example.test", "password": self.PASSWORD},
        )
        self.assertEqual(response["Location"], "/accounts/confirm-email/")
        response = self.post(response["Location"], {"code": self.emailed_code()})

        self.assertTemplateUsed(response, "accounts/login_complete.html")
        self.assertEqual(self.session_email(), "alice@example.test")

    def test_superuser_creation_skips_an_address_another_account_holds_verified(self):
        other = self.account("other@example.test")
        EmailAddress.objects.create(user=other, email="held@example.test", verified=True)

        User.objects.create_superuser("held@example.test", self.PASSWORD)

        self.assertEqual(EmailAddress.objects.filter(email="held@example.test").count(), 1)

    def test_stale_password_record_of_another_account_does_not_admit_a_promoted_signup(self):
        self.post("/accounts/email/", {"email": "new@example.test"})
        session = self.client.session
        session["account_authentication_methods"] = [
            {"method": "password", "email": "other@example.test", "at": 0}
        ]
        session.save()
        User.objects.filter(email="new@example.test").update(is_staff=True)

        response = self.post("/accounts/confirm-email/", {"code": self.emailed_code()})

        self.assertTemplateUsed(response, "account/password_only.html")
        self.assertIsNone(self.session_email())

    def test_signed_in_visit_to_the_confirmation_page_leaves_for_home(self):
        self.post("/accounts/email/", {"email": "new@example.test"})
        self.post("/accounts/confirm-email/", {"code": self.emailed_code()})

        response = self.client.get("/accounts/confirm-email/")

        self.assertEqual(response["Location"], "/")

    def test_deactivated_account_gets_no_session_from_either_email_endpoint(self):
        self.account(is_active=False)
        for path in ("/accounts/email/", "/accounts/login/code/"):
            with self.subTest(path=path):
                self.client.cookies.clear()
                self.client.get("/accounts/login/")
                mail.outbox.clear()

                self.post(path, {"email": "alice@example.test"})

                self.assertFalse([m for m in mail.outbox if "Sign-In Code" in m.subject])
                self.assertIsNone(self.session_email())

    def test_wrong_password_posted_to_the_bare_login_url_keeps_the_password_form(self):
        self.account()

        response = self.post(
            "/accounts/login/", {"login": "alice@example.test", "password": "wrong"}
        )

        self.assertContains(response, 'name="password"')
        self.assertNotContains(response, 'name="email"')

    def test_signup_keeps_the_requested_destination(self):
        response = self.post("/accounts/email/", {"email": "new@example.test", "next": "/n/doc"})

        response = self.post(response["Location"], {"code": self.emailed_code()})

        self.assertEqual(response.context["next_url"], "/n/doc")

    def test_administrator_signs_in_through_the_headless_api_with_a_password(self):
        self.account(is_staff=True)

        response = self.client.post(
            "/api/auth/browser/v1/auth/login",
            {"email": "alice@example.test", "password": self.PASSWORD},
            content_type="application/json",
            headers={"X-CSRFToken": self.client.cookies[settings.CSRF_COOKIE_NAME].value},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["data"]["user"]["is_staff"])

    def test_administrator_signs_in_with_a_password_typed_in_another_letter_case(self):
        self.account(is_staff=True)

        response = self.post(
            "/accounts/login/?method=password",
            {"login": "ALICE@Example.test", "password": self.PASSWORD},
        )

        self.assertTemplateUsed(response, "accounts/login_complete.html")

    def test_superuser_without_staff_status_cannot_sign_in_with_a_code(self):
        self.account(is_superuser=True)

        response = self.post("/accounts/email/", {"email": "alice@example.test"})
        response = self.post(response["Location"], {"code": self.emailed_code()})

        self.assertTemplateUsed(response, "account/password_only.html")
        self.assertIsNone(self.session_email())

    def test_account_promoted_before_confirming_signup_cannot_sign_in_with_its_code(self):
        self.post("/accounts/email/", {"email": "new@example.test"})
        User.objects.filter(email="new@example.test").update(is_staff=True)

        response = self.post("/accounts/confirm-email/", {"code": self.emailed_code()})

        self.assertTemplateUsed(response, "account/password_only.html")
        self.assertIsNone(self.session_email())

    def test_abandoned_signup_resumes_with_a_sign_in_code(self):
        self.post("/accounts/email/", {"email": "new@example.test"})
        self.client.cookies.clear()
        self.client.get("/accounts/login/")

        response = self.post("/accounts/email/", {"email": "new@example.test"})
        self.assertTrue(response["Location"].startswith("/accounts/login/code/confirm/"))
        self.post(response["Location"], {"code": self.emailed_code()})

        self.assertEqual(self.session_email(), "new@example.test")
        self.assertEqual(User.objects.filter(email="new@example.test").count(), 1)

    def test_signed_in_user_cancelling_leaves_through_the_app_sign_out(self):
        self.account()
        self.post(
            "/accounts/login/?method=password",
            {"login": "alice@example.test", "password": self.PASSWORD},
        )

        response = self.post("/accounts/logout/", {})

        self.assertEqual(response["Location"], "/sign-out/")
        self.assertEqual(self.session_email(), "alice@example.test")

    def test_login_page_offers_the_email_form_and_a_switch_to_the_password_form(self):
        page = self.client.get("/accounts/login/?next=/n/doc")
        self.assertContains(page, 'name="email"')
        self.assertNotContains(page, 'name="password"')
        self.assertContains(page, "/accounts/login/?method=password&amp;next=%2Fn%2Fdoc")
        self.assertContains(
            page, '<input type="hidden" name="next" value="/n/doc">', count=2, html=True
        )

        page = self.client.get("/accounts/login/?method=password&next=/n/doc")
        self.assertContains(page, 'name="password"')
        self.assertNotContains(page, 'name="email"')
        self.assertContains(page, 'href="/accounts/login/?next=%2Fn%2Fdoc"')

    def test_wrong_password_keeps_the_password_form(self):
        self.account()
        response = self.post(
            "/accounts/login/?method=password",
            {"login": "alice@example.test", "password": "wrong"},
        )
        self.assertContains(response, 'name="password"')

    def test_admin_add_form_skips_an_address_another_account_holds_verified(self):
        other = self.account("other@example.test")
        EmailAddress.objects.create(user=other, email="held@example.test", verified=True)
        operator = User.objects.create_superuser("operator@example.test", self.PASSWORD)
        self.client.force_login(operator)

        response = self.post(
            "/admin/accounts/user/add/",
            {"email": "held@example.test", "password1": self.PASSWORD, "password2": self.PASSWORD},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(EmailAddress.objects.filter(email="held@example.test").count(), 1)

    def test_operator_created_account_signs_in_with_its_password(self):
        operator = User.objects.create_superuser("operator@example.test", self.PASSWORD)
        self.client.force_login(operator)
        self.post(
            "/admin/accounts/user/add/",
            {"email": "made@example.test", "password1": self.PASSWORD, "password2": self.PASSWORD},
        )
        self.client.logout()
        self.client.get("/accounts/login/")

        response = self.post(
            "/accounts/login/?method=password",
            {"login": "made@example.test", "password": self.PASSWORD},
        )

        self.assertTemplateUsed(response, "accounts/login_complete.html")


class EmailSignInDisabledTests(TestCase):
    def test_without_email_delivery_sign_in_is_password_only_and_signup_is_closed(self):
        page = self.client.get("/accounts/login/")
        self.assertContains(page, 'name="password"')
        self.assertNotContains(page, 'name="email"')
        for path in ("signup/", "login/code/", "login/code/confirm/", "confirm-email/"):
            self.assertEqual(self.client.get(f"/accounts/{path}").status_code, 404)
        self.assertEqual(
            self.client.post("/accounts/email/", {"email": "a@b.test"}).status_code, 404
        )
        self.assertEqual(self.client.post("/accounts/logout/").status_code, 404)
        self.assertFalse(User.objects.exists())


class VerifyExistingAddressesMigrationTests(TransactionTestCase):
    before = [("accounts", "0003_productupdatesubscription")]
    after = [("accounts", "0004_verify_existing_email_addresses")]

    def test_only_accounts_without_an_address_record_gain_a_verified_one(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.before)
        apps = executor.loader.project_state(
            [*self.before, ("account", "0009_emailaddress_unique_primary_email")]
        ).apps
        HistoricalUser = apps.get_model("accounts", "User")
        HistoricalAddress = apps.get_model("account", "EmailAddress")
        HistoricalUser.objects.create(email="legacy@example.test")
        pending = HistoricalUser.objects.create(email="pending@example.test")
        HistoricalAddress.objects.create(user=pending, email=pending.email, primary=True)
        holder = HistoricalUser.objects.create(email="holder@example.test")
        HistoricalAddress.objects.create(
            user=holder, email="held@example.test", primary=True, verified=True
        )
        HistoricalUser.objects.create(email="held@example.test")
        HistoricalUser.objects.create(email="Mixed@Example.test")
        HistoricalUser.objects.create(email="mixed@example.test")
        HistoricalUser.objects.create(email="Held@Example.test")
        cased = HistoricalUser.objects.create(email="cased-holder@example.test")
        HistoricalAddress.objects.create(
            user=cased, email="Cased@Example.test", primary=True, verified=True
        )
        HistoricalUser.objects.create(email="cased@example.test")

        executor = MigrationExecutor(connection)
        executor.migrate(self.after)

        self.assertEqual(
            dict(EmailAddress.objects.values_list("email", "verified")),
            {
                "legacy@example.test": True,
                "pending@example.test": False,
                "held@example.test": True,
                "mixed@example.test": True,
                "Cased@Example.test": True,
            },
        )
        self.assertEqual(EmailAddress.objects.filter(email="held@example.test").count(), 1)
        self.assertEqual(EmailAddress.objects.filter(email="mixed@example.test").count(), 1)
        self.assertEqual(EmailAddress.objects.filter(email__iexact="cased@example.test").count(), 1)
