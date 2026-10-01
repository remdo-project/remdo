from datetime import datetime
from datetime import timezone as datetime_timezone

from allauth.account.models import EmailAddress
from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from documents.models import Document

from .models import ProductUpdateSubscription, User


class ProductUpdateSubscriptionTests(TestCase):
    def test_public_form_saves_an_unconfirmed_request_without_an_account_or_email(self):
        response = self.client.post("/keep-me-posted/", {"email": "  Visitor@Example.test  "})

        self.assertRedirects(response, "/keep-me-posted/?saved=1#landing-signup")
        subscription = ProductUpdateSubscription.objects.get()
        self.assertEqual(subscription.email, "visitor@example.test")
        self.assertIsNotNone(subscription.requested_at)
        self.assertIsNone(subscription.confirmed_at)
        self.assertIsNone(subscription.withdrawn_at)
        self.assertFalse(User.objects.exists())
        self.assertFalse(EmailAddress.objects.exists())
        self.assertFalse(Document.objects.exists())
        self.assertNotIn("_auth_user_id", self.client.session)
        self.assertEqual(mail.outbox, [])
        self.assertContains(
            self.client.get(response.url), "Thanks for your interest. Your request has been saved."
        )

    def test_repeat_submissions_preserve_every_subscription_state(self):
        requested = datetime(2026, 9, 1, tzinfo=datetime_timezone.utc)
        changed = datetime(2026, 9, 2, tzinfo=datetime_timezone.utc)
        for confirmed, withdrawn in ((None, None), (changed, None), (changed, changed)):
            with self.subTest(confirmed=confirmed, withdrawn=withdrawn):
                ProductUpdateSubscription.objects.all().delete()
                subscription = ProductUpdateSubscription.objects.create(
                    email="visitor@example.test",
                    requested_at=requested,
                    confirmed_at=confirmed,
                    withdrawn_at=withdrawn,
                )
                response = self.client.post("/keep-me-posted/", {"email": "Visitor@Example.test"})
                self.assertEqual(response.url, "/keep-me-posted/?saved=1#landing-signup")
                self.assertEqual(ProductUpdateSubscription.objects.count(), 1)
                subscription.refresh_from_db()
                self.assertEqual(subscription.requested_at, requested)
                self.assertEqual(subscription.confirmed_at, confirmed)
                self.assertEqual(subscription.withdrawn_at, withdrawn)

    def test_existing_accounts_use_the_same_flow_without_changing_account_state(self):
        for password, extra in (
            ("visitor-password-1234", {}),
            (None, {}),
            ("visitor-password-1234", {"is_staff": True}),
            ("visitor-password-1234", {"is_active": False}),
        ):
            with self.subTest(password=password, extra=extra):
                ProductUpdateSubscription.objects.all().delete()
                User.objects.all().delete()
                user = User.objects.create_user("visitor@example.test", password, **extra)
                EmailAddress.objects.create(
                    user=user, email=user.email, primary=True, verified=True
                )
                documents = list(Document.objects.values())
                self.client.force_login(user)
                before = User.objects.values().get()

                response = self.client.post("/keep-me-posted/", {"email": user.email})

                self.assertEqual(response.url, "/keep-me-posted/?saved=1#landing-signup")
                self.assertEqual(User.objects.values().get(), before)
                self.assertEqual(list(Document.objects.values()), documents)
                self.assertIsNone(ProductUpdateSubscription.objects.get().confirmed_at)
                self.assertEqual(mail.outbox, [])
                self.assertContains(self.client.get(response.url), "Your request has been saved.")
                self.client.logout()

    def test_subscription_does_not_prevent_later_account_provisioning(self):
        self.client.post("/keep-me-posted/", {"email": "visitor@example.test"})
        call_command("provision_user", email="visitor@example.test", password="new-password-1234")

        user = User.objects.get(email="visitor@example.test")
        self.assertTrue(user.check_password("new-password-1234"))
        self.assertEqual(user.document_set.count(), 1)
        self.assertEqual(ProductUpdateSubscription.objects.get().email, user.email)
        self.assertIsNone(ProductUpdateSubscription.objects.get().confirmed_at)

    def test_invalid_addresses_stay_beside_the_form_and_create_no_request(self):
        for email in ("", "not-an-email", f"{'x' * 250}@example.test", f"{'a' * 247}@İ.test"):
            with self.subTest(email=email):
                response = self.client.post("/keep-me-posted/", {"email": email})
                self.assertEqual(response.status_code, 200)
                self.assertContains(response, 'aria-invalid="true"')
                self.assertContains(response, 'id="landing-signup-error" role="alert"')
                self.assertFalse(ProductUpdateSubscription.objects.exists())

    def test_distinct_aliases_remain_distinct_requests(self):
        for email in (
            "visitor@example.test",
            "visitor+notes@example.test",
            "vis.itor@example.test",
        ):
            self.client.post("/keep-me-posted/", {"email": email})
        self.assertEqual(ProductUpdateSubscription.objects.count(), 3)

    def test_form_requires_csrf_and_rejects_other_mutation_methods(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(
            client.post("/keep-me-posted/", {"email": "visitor@example.test"}).status_code, 403
        )
        client.get("/")
        token = client.cookies[settings.CSRF_COOKIE_NAME].value
        response = client.post(
            "/keep-me-posted/", {"email": "visitor@example.test", "csrfmiddlewaretoken": token}
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(client.put("/keep-me-posted/", HTTP_X_CSRFTOKEN=token).status_code, 405)
        self.assertEqual(ProductUpdateSubscription.objects.count(), 1)

    @override_settings(ACCOUNT_RATE_LIMITS={"product_update_subscription": "2/m/ip"})
    def test_submission_limits_apply_before_saving_more_addresses(self):
        cache.clear()
        self.addCleanup(cache.clear)
        for email in ("first@example.test", "second@example.test"):
            self.assertEqual(
                self.client.post("/keep-me-posted/", {"email": email}).status_code, 302
            )
        self.assertEqual(
            self.client.post("/keep-me-posted/", {"email": "third@example.test"}).status_code, 429
        )
        self.assertFalse(
            ProductUpdateSubscription.objects.filter(email="third@example.test").exists()
        )
        self.assertEqual(
            self.client.post(
                "/keep-me-posted/", {"email": "third@example.test"}, REMOTE_ADDR="192.0.2.2"
            ).status_code,
            302,
        )

    def test_administrators_can_find_requests_and_record_withdrawal(self):
        subscription = ProductUpdateSubscription.objects.create(email="visitor@example.test")
        self.client.force_login(
            User.objects.create_superuser("admin@example.test", "password-1234")
        )
        response = self.client.get("/admin/accounts/productupdatesubscription/?q=visitor")
        self.assertContains(response, subscription.email)
        response = self.client.post(
            f"/admin/accounts/productupdatesubscription/{subscription.pk}/change/",
            {"withdrawn_at_0": "2026-10-01", "withdrawn_at_1": "12:00:00", "_save": "Save"},
        )
        self.assertEqual(response.status_code, 302)
        subscription.refresh_from_db()
        self.assertIsNotNone(subscription.withdrawn_at)
        self.assertIsNone(subscription.confirmed_at)
