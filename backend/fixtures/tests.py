import io
import json

from accounts.models import User
from allauth.account.models import EmailAddress
from django.core.management import call_command
from django.db import IntegrityError
from django.test import TestCase
from documents.models import Document


class DevelopmentUsersTests(TestCase):
    def test_startup_creates_roles_and_preserves_existing_accounts_and_documents(self):
        call_command("setup_development_users")
        admin = User.objects.get(email="admin@example.test")
        user = User.objects.get(email="user@example.test")
        self.assertTrue(admin.is_staff and admin.is_superuser)
        self.assertFalse(user.is_staff or user.is_superuser)
        self.assertTrue(admin.check_password("admin-password-1234"))
        self.assertTrue(user.check_password("user-password-1234"))
        self.assertTrue(EmailAddress.objects.filter(user=admin, verified=True).exists())
        document = Document.objects.create(owner=admin, title="Keep")
        admin.set_password("changed-password")
        admin.is_staff = admin.is_superuser = False
        admin.save()

        call_command("setup_development_users")

        admin.refresh_from_db()
        self.assertTrue(admin.check_password("changed-password"))
        self.assertFalse(admin.is_staff or admin.is_superuser)
        self.assertTrue(Document.objects.filter(pk=document.pk, owner=admin).exists())
        self.assertEqual(User.objects.count(), 2)

    def test_reset_restores_roles_and_preserves_unrelated_accounts(self):
        call_command("setup_development_users")
        admin = User.objects.get(email="admin@example.test")
        admin.is_staff = admin.is_superuser = False
        admin.save()
        document = Document.objects.create(owner=admin, title="Replace")
        other = User.objects.create_user("other@example.test", "other-password")
        preserved = Document.objects.create(owner=other, title="Keep")

        call_command("setup_development_users", reset=True)

        replacement = User.objects.get(email="admin@example.test")
        self.assertNotEqual(replacement.pk, admin.pk)
        self.assertTrue(replacement.is_staff and replacement.is_superuser)
        self.assertFalse(Document.objects.filter(pk=document.pk).exists())
        self.assertTrue(Document.objects.filter(pk=preserved.pk, owner=other).exists())


class FixtureDocumentsTests(TestCase):
    def test_failed_batch_does_not_leave_partial_documents(self):
        owner = User.objects.create_user("fixtures@example.test", "test-password")
        existing = Document.objects.create(owner=owner, id="existing", title="Keep")
        with self.assertRaises(IntegrityError):
            call_command(
                "create_fixture_documents",
                json.dumps(
                    [
                        {"email": owner.email, "id": "fresh", "title": "New"},
                        {"email": owner.email, "id": existing.id, "title": "Collision"},
                    ]
                ),
                stdout=io.StringIO(),
            )
        self.assertFalse(Document.objects.filter(pk="fresh").exists())
        existing.refresh_from_db()
        self.assertEqual(existing.title, "Keep")
