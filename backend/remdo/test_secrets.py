import json
import os
import subprocess
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
        self.pair = {"private_key": "k" * 38, "server_token": "t" * 45}

    def generate(self):
        with patch(
            "remdo.secrets.subprocess.run",
            return_value=subprocess.CompletedProcess([], 0, stdout=json.dumps(self.pair)),
        ):
            return load_secrets(self.root)

    def test_fresh_bundle_is_private_and_reused_ignoring_environment(self):
        original = self.generate()
        self.assertGreaterEqual(len(original["auth_secret"]), 48)
        self.assertEqual(original["ysweet_auth_key"], self.pair["private_key"])
        self.assertEqual(original["ysweet_server_token"], self.pair["server_token"])
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        with (
            patch.dict(os.environ, AUTH_SECRET="different", YSWEET_AUTH_KEY="different"),
            patch("remdo.secrets.subprocess.run", side_effect=AssertionError("must reuse")),
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

    def test_missing_bundle_refuses_existing_metadata_or_collaboration_data(self):
        for name in ("django.sqlite3", "remdo.sqlite", "collab/document"):
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

    def test_generation_failure_does_not_publish_partial_bundle_or_secret_output(self):
        with patch(
            "remdo.secrets.subprocess.run",
            side_effect=subprocess.CalledProcessError(
                1, ["y-sweet"], output="sensitive-output", stderr="sensitive-error"
            ),
        ):
            with self.assertRaisesMessage(ImproperlyConfigured, "Y-Sweet secret generation failed"):
                load_secrets(self.root)
        self.assertFalse(self.path.exists())

    def test_existing_publicly_readable_bundle_is_rejected(self):
        self.generate()
        self.path.chmod(0o644)
        with self.assertRaisesMessage(ImproperlyConfigured, "chmod 600"):
            load_secrets(self.root)
