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
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.path = self.root / "secrets.json"

    def generate(self):
        return load_secrets(self.root)

    def test_fresh_bundle_is_private_and_reused_ignoring_environment(self):
        original = self.generate()
        self.assertGreaterEqual(len(original["auth_secret"]), 48)
        self.assertGreaterEqual(len(original["collaboration_secret"]), 48)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        with (
            patch.dict(os.environ, AUTH_SECRET="different", COLLAB_INTERNAL_SECRET="different"),
            patch("remdo.secrets.secrets.token_urlsafe", side_effect=AssertionError("must reuse")),
        ):
            self.assertEqual(load_secrets(self.root), original)

    def test_corrupt_or_incomplete_bundle_fails_without_repair(self):
        for content in ("", "not-json", "{}", "[]", '{"auth_secret":"short"}'):
            with self.subTest(content=content):
                self.path.write_text(content)
                self.path.chmod(0o600)
                with self.assertRaisesMessage(ImproperlyConfigured, "restore the complete"):
                    self.generate()
                self.assertEqual(self.path.read_text(), content)

    def test_missing_bundle_refuses_existing_database(self):
        for name in ("django.sqlite3",):
            with self.subTest(name=name):
                data = self.root / name
                data.parent.mkdir(exist_ok=True)
                data.touch()
                with self.assertRaisesMessage(ImproperlyConfigured, "existing dataset"):
                    self.generate()
                self.assertFalse(self.path.exists())
                data.unlink()

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
