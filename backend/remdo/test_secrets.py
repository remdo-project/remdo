import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from .secrets import load_secrets


class SecretBundleTests(SimpleTestCase):
    def setUp(self):
        database = patch("remdo.secrets.database_has_data", return_value=False)
        self.database_has_data = database.start()
        self.addCleanup(database.stop)
        environment = patch.dict(os.environ, AUTH_SECRET="", COLLAB_INTERNAL_SECRET="")
        environment.start()
        self.addCleanup(environment.stop)
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.path = self.root / "secrets.json"
        self.supplied = {
            key: key + "-" + "s" * 48 for key in ("auth_secret", "collaboration_secret")
        }

    def generate(self):
        return load_secrets(self.root)

    def environment(self, **overrides):
        supplied = {
            "AUTH_SECRET": self.supplied["auth_secret"],
            "COLLAB_INTERNAL_SECRET": self.supplied["collaboration_secret"],
        }
        return patch.dict(os.environ, {**supplied, **overrides})

    def test_fresh_bundle_is_private_and_reused(self):
        original = self.generate()
        self.assertGreaterEqual(len(original["auth_secret"]), 48)
        self.assertGreaterEqual(len(original["collaboration_secret"]), 48)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        with patch("remdo.secrets.secrets.token_urlsafe", side_effect=AssertionError("must reuse")):
            self.assertEqual(self.generate(), original)

    def test_environment_bundle_is_used_without_touching_the_data_root(self):
        missing = self.root / "absent"
        with self.environment():
            self.assertEqual(load_secrets(missing), self.supplied)
        self.assertFalse(missing.exists())
        self.database_has_data.assert_not_called()

    def test_environment_bundle_outranks_a_stored_bundle(self):
        self.generate()
        with self.environment():
            self.assertEqual(self.generate(), self.supplied)

    def test_partial_or_weak_environment_bundle_fails_without_generating(self):
        for overrides in (
            {"AUTH_SECRET": ""},
            {"COLLAB_INTERNAL_SECRET": ""},
            {"AUTH_SECRET": "short"},
        ):
            with self.subTest(overrides=overrides):
                with (
                    self.environment(**overrides),
                    self.assertRaisesMessage(ImproperlyConfigured, "at least 32 characters"),
                ):
                    self.generate()
                self.assertFalse(self.path.exists())

    def test_corrupt_or_incomplete_bundle_fails_without_repair(self):
        for content in ("", "not-json", "{}", "[]", '{"auth_secret":"short"}'):
            with self.subTest(content=content):
                self.path.write_text(content)
                self.path.chmod(0o600)
                with self.assertRaisesMessage(ImproperlyConfigured, "restore the complete"):
                    self.generate()
                self.assertEqual(self.path.read_text(), content)

    def test_missing_bundle_refuses_existing_database(self):
        (self.root / "django.sqlite3").touch()
        with self.assertRaisesMessage(ImproperlyConfigured, "existing dataset"):
            self.generate()
        self.assertFalse(self.path.exists())

    def test_missing_bundle_refuses_existing_postgresql_metadata(self):
        self.database_has_data.return_value = True
        with self.assertRaisesMessage(ImproperlyConfigured, "existing dataset"):
            self.generate()
        self.assertFalse(self.path.exists())

    def test_existing_publicly_readable_bundle_is_rejected(self):
        self.generate()
        self.path.chmod(0o644)
        with self.assertRaisesMessage(ImproperlyConfigured, "chmod 600"):
            load_secrets(self.root)
