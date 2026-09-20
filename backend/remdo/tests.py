import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from .testing import DEFAULT_TEST_LABELS, DefaultLabelTestRunner

ROOT = Path(__file__).resolve().parents[2]
REPORT = """
import json
from django.conf import settings
from django.core.management import get_commands
print(json.dumps({
    'database': settings.DATABASES['default']['ENGINE'],
    'debug': settings.DEBUG,
    'data': str(settings.DATA_DIR),
    'origin': settings.APP_ORIGIN,
    'origins': settings.CSRF_TRUSTED_ORIGINS,
    'cookie': settings.SESSION_COOKIE_NAME,
    'secure': settings.SESSION_COOKIE_SECURE,
    'fixtures': any(name in get_commands() for name in ('create_fixture_documents', 'reset_fixture_users', 'provision_user', 'setup_development_users')),
}))
"""
PASSWORD_REPORT = """
import json
from django.contrib.auth.hashers import make_password, check_password
password = make_password('configuration-test-password')
print(json.dumps({
    'algorithm': password.split('$')[0],
    'valid': check_password('configuration-test-password', password),
    'wrong_valid': check_password('wrong-password', password),
}))
"""
CLIENT_IP_REPORT = """
import json
from allauth.account.adapter import get_adapter
from django.core.exceptions import PermissionDenied
from django.test import RequestFactory

def address(headers):
    request = RequestFactory().get('/', REMOTE_ADDR='127.0.0.1', headers=headers)
    try:
        return get_adapter().get_client_ip(request)
    except PermissionDenied:
        return 'denied'

print(json.dumps([
    address({'X-Forwarded-For': '192.0.2.99, 198.51.100.1',
             'CF-Connecting-IP': '203.0.113.1'}),
    address({'X-Forwarded-For': '198.51.100.1'}),
    address({'X-Forwarded-For': '198.51.100.1', 'CF-Connecting-IP': 'invalid'}),
]))
"""


class ConfigurationTests(SimpleTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env = {
            "PATH": "",
            "DATA_DIR": self.directory.name,
            "AUTH_SECRET": "configuration-test-secret",
            "APP_ORIGIN": "https://remdo.example",
            "YSWEET_CONNECTION_STRING": "ys://127.0.0.1:4004",
            "YSWEET_SERVER_TOKEN": "configuration-test-token",
            "YSWEET_AUTH_KEY": "configuration-test-key",
        }

        bundle = Path(self.directory.name) / "secrets.json"
        bundle.write_text(
            json.dumps(
                {
                    key: "fixture-" + "x" * 48
                    for key in ("auth_secret", "ysweet_auth_key", "ysweet_server_token")
                }
            )
        )
        bundle.chmod(0o600)

    def settings(self, report=REPORT, **overrides):
        result = subprocess.run(
            [
                sys.executable,
                str(ROOT / "backend/manage.py"),
                "shell",
                "--no-imports",
                "-c",
                report,
            ],
            env={**self.env, **overrides},
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_database_selection(self):
        self.assertEqual(self.settings()["database"], "django.db.backends.sqlite3")
        self.assertEqual(
            self.settings(DATABASE_URL="postgresql://test:testing@localhost/remdo")["database"],
            "django.db.backends.postgresql",
        )

    def test_production_client_address_trust_matches_the_hosting_boundary(self):
        for environment, expected in (
            ({}, ["198.51.100.1"] * 3),
            ({"PORT": "8080"}, ["198.51.100.1"] * 3),
            ({"RENDER": "true", "PORT": "8080"}, ["203.0.113.1", "denied", "denied"]),
            ({"RENDER": "true", "DJANGO_SETTINGS_MODULE": "remdo.development"}, ["127.0.0.1"] * 3),
        ):
            with self.subTest(environment=environment):
                self.assertEqual(self.settings(report=CLIENT_IP_REPORT, **environment), expected)

    def test_native_management_defaults_to_production_without_node(self):
        result = self.settings(NODE_ENV="development", PREVIEW_PORT="4020")
        self.assertFalse(result["debug"])
        self.assertFalse(result["fixtures"])
        self.assertTrue(result["secure"])
        self.assertEqual(result["origins"], ["https://remdo.example"])
        self.assertEqual(result["cookie"], "remdo_session_443")

    def test_frontend_build_mode_does_not_change_development_settings(self):
        result = self.settings(
            DJANGO_SETTINGS_MODULE="remdo.development",
            NODE_ENV="production",
            APP_ORIGIN="http://browser-visible.test:5300",
            PREVIEW_PORT="5320",
        )
        self.assertTrue(result["debug"])
        self.assertTrue(result["fixtures"])
        self.assertFalse(result["secure"])
        self.assertEqual(result["cookie"], "remdo_session_5300")
        self.assertIn("http://localhost:5320", result["origins"])
        self.assertIn("http://127.0.0.1:5300", result["origins"])

    def test_fast_password_hashing_is_confined_to_test_settings(self):
        for module, algorithm in (
            ("remdo.settings", "pbkdf2_sha256"),
            ("remdo.development", "pbkdf2_sha256"),
            ("remdo.testing", "md5"),
        ):
            with self.subTest(module=module):
                result = self.settings(
                    report=PASSWORD_REPORT,
                    DJANGO_SETTINGS_MODULE=module,
                    NODE_ENV="test",
                )
                self.assertEqual(result["algorithm"], algorithm)
                self.assertTrue(result["valid"])
                self.assertFalse(result["wrong_valid"])

    def test_separate_working_directories_resolve_isolated_stacks(self):
        results = []
        for base in (5100, 7100):
            checkout = Path(self.directory.name) / str(base)
            (checkout / "tools/lib").mkdir(parents=True)
            shutil.copy(ROOT / "tools/lib/env-file.sh", checkout / "tools/lib/env-file.sh")
            for script in ("env.sh", "env.defaults.sh"):
                shutil.copy(ROOT / "tools" / script, checkout / "tools" / script)
            (checkout / ".env").write_text(f"PORT_BASE={base}\nHOST=127.0.0.1\n")
            result = subprocess.run(
                [
                    str(checkout / "tools/env.sh"),
                    sys.executable,
                    str(ROOT / "backend/manage.py"),
                    "shell",
                    "--no-imports",
                    "-c",
                    REPORT,
                ],
                cwd=checkout,
                env={"PATH": os.defpath, "NODE_ENV": "production"},
                capture_output=True,
                text=True,
                check=True,
            )
            results.append(json.loads(result.stdout))
            self.assertEqual(results[-1]["data"], str(checkout / "data"))
            self.assertEqual(results[-1]["origin"], f"http://127.0.0.1:{base}")
            self.assertEqual(results[-1]["cookie"], f"remdo_session_{base}")
        self.assertNotEqual(results[0]["cookie"], results[1]["cookie"])

    def test_invalid_backend_configuration_fails_at_startup(self):
        for overrides, message in (
            ({"DATA_DIR": ""}, "DATA_DIR is required"),
            ({"DATABASE_URL": "mysql://localhost/remdo"}, "DATABASE_URL must select PostgreSQL"),
            ({"APP_ORIGIN": "https://remdo.example/path"}, "APP_ORIGIN must be an exact"),
            ({"APP_ORIGIN": "http://user:password@localhost"}, "APP_ORIGIN must be an exact"),
        ):
            with self.subTest(overrides=overrides):
                result = subprocess.run(
                    [sys.executable, str(ROOT / "backend/manage.py"), "check"],
                    env={**self.env, **overrides},
                    capture_output=True,
                    text=True,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(message, result.stderr)

    def test_production_request_errors_are_visible_without_confidential_data(self):
        report = """
import json
import logging
from types import ModuleType
from django.http import HttpResponse
from django.test import Client, override_settings
from django.urls import path

def fail(request, document):
    confidential_local = 'private-local-value'
    try:
        raise ValueError('private-cause-message')
    except ValueError as cause:
        raise RuntimeError('private-exception-message') from cause

def unavailable(request, document):
    return HttpResponse('private-response-body', status=503)

routes = ModuleType('diagnostic_routes')
routes.urlpatterns = [path('fail/<str:document>', fail), path('unavailable/<str:document>', unavailable)]
with override_settings(ROOT_URLCONF=routes):
    client = Client(raise_request_exception=False)
    client.cookies['private-cookie-name'] = 'private-cookie-value'
    responses = [client.post(
        '/' + route + '/private-document-id?private-query=value',
        {'private-form-field': 'private-form-value'},
        HTTP_HOST='remdo.example',
        HTTP_AUTHORIZATION='Bearer private-token',
    ).status_code for route in ('fail', 'unavailable')]
    responses.append(client.get('/', HTTP_HOST='private-invalid-host.example').status_code)
logging.getLogger('django.db.backends').warning('unrelated-django-warning')
print(json.dumps(responses))
"""
        result = subprocess.run(
            [
                sys.executable,
                str(ROOT / "backend/manage.py"),
                "shell",
                "--no-imports",
                "-c",
                report,
            ],
            env=self.env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), [500, 503, 400])
        records = [json.loads(line) for line in result.stderr.splitlines()]
        self.assertEqual(len(records), 3, records)
        self.assertEqual([record["status"] for record in records], [500, 503, 400])
        self.assertEqual(records[0]["exception"], "RuntimeError")
        self.assertTrue(any(frame["function"] == "fail" for frame in records[0]["frames"]))
        self.assertTrue(all(frame["line"] > 0 for frame in records[0]["frames"]))
        self.assertEqual(records[1]["logger"], "django.request")
        self.assertEqual(records[2]["exception"], "DisallowedHost")
        self.assertNotIn("private-", result.stderr)


class DefaultTestLabelTests(SimpleTestCase):
    # Discovery from the repository root finds no tests and still exits 0, so an
    # invocation without a label must fall back to the application suites rather
    # than report success having verified nothing.
    def test_an_invocation_without_a_label_verifies_the_application_suites(self):
        runner = DefaultLabelTestRunner()

        self.assertGreater(runner.build_suite([]).countTestCases(), 0)
        self.assertEqual(
            runner.build_suite([]).countTestCases(),
            runner.build_suite(list(DEFAULT_TEST_LABELS)).countTestCases(),
        )

    def test_an_explicit_label_is_not_replaced_by_the_default(self):
        runner = DefaultLabelTestRunner()

        selected = runner.build_suite(["remdo"]).countTestCases()

        self.assertGreater(selected, 0)
        self.assertLess(selected, runner.build_suite([]).countTestCases())
