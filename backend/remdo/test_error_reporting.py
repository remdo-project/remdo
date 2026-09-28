import gzip
import json
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from django.test import SimpleTestCase, override_settings

ROOT = Path(__file__).resolve().parents[2]


class FakeIngest:
    """Records envelopes posted to a Sentry-compatible envelope endpoint."""

    def __init__(self):
        self.received = []
        ingest = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers["Content-Length"]))
                if self.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                ingest.received.append((self.path, body))
                self.send_response(200)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.dsn = f"http://publickey@127.0.0.1:{self.server.server_port}/7"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()

    def items(self):
        return [
            (json.loads(header)["type"], json.loads(item))
            for _, body in self.received
            for header, item in zip(body.splitlines()[1::2], body.splitlines()[2::2])
        ]


class ConfigurationTests(SimpleTestCase):
    def test_public_configuration_exposes_the_reporting_project(self):
        dsn = "https://publickey@ingest.example/7"
        for configured in ("", dsn):
            with self.subTest(configured=configured), override_settings(SENTRY_DSN=configured):
                configuration = self.client.get("/api/config").json()
                self.assertEqual(configuration["errorReportingDsn"], configured)


PRODUCTION_FAILURE = """
import io
import json
from types import ModuleType
import sentry_sdk
from django.core.handlers.wsgi import WSGIHandler
from django.test import override_settings
from django.urls import path
from django.views.decorators.csrf import csrf_exempt

@csrf_exempt
def fail(request, document):
    confidential_local = 'private-local-value'
    raise RuntimeError('reported-exception-message')

routes = ModuleType('reporting_routes')
routes.urlpatterns = [path('fail/<str:document>', fail)]
body = b'private-form-field=private-form-value'
environ = {
    'REQUEST_METHOD': 'POST',
    'PATH_INFO': '/fail/document-id',
    'QUERY_STRING': 'code=private-query-value',
    'SERVER_NAME': 'remdo.example',
    'SERVER_PORT': '443',
    'REMOTE_ADDR': '198.51.100.7',
    'wsgi.url_scheme': 'https',
    'wsgi.input': io.BytesIO(body),
    'CONTENT_TYPE': 'application/x-www-form-urlencoded',
    'CONTENT_LENGTH': str(len(body)),
    'HTTP_HOST': 'remdo.example',
    'HTTP_USER_AGENT': 'reporting-test-agent',
    'HTTP_COOKIE': 'private-cookie-name=private-cookie-value',
    'HTTP_AUTHORIZATION': 'Bearer private-token',
    'HTTP_X_REMDO_COLLABORATION_SECRET': 'private-collaboration-secret',
}
statuses = []
with override_settings(ROOT_URLCONF=routes):
    WSGIHandler()(environ, lambda status, headers: statuses.append(status))
sentry_sdk.flush()
print(json.dumps(statuses))
"""


class ProductionReportingTests(SimpleTestCase):
    def test_production_failures_are_reported_without_confidential_request_data(self):
        ingest = FakeIngest()
        self.addCleanup(ingest.close)
        with tempfile.TemporaryDirectory() as data_dir:
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "backend/manage.py"),
                    "shell",
                    "--no-imports",
                    "-c",
                    PRODUCTION_FAILURE,
                ],
                env={
                    "PATH": "",
                    "DATA_DIR": data_dir,
                    "AUTH_SECRET": "reporting-test-auth-" + "x" * 32,
                    "APP_ORIGIN": "https://remdo.example",
                    "COLLAB_INTERNAL_SECRET": "reporting-test-collab-" + "x" * 32,
                    "BUILD_REVISION": "reporting-test-revision",
                    "SENTRY_DSN": ingest.dsn,
                },
                capture_output=True,
                text=True,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), ["500 Internal Server Error"])
        [(item_type, event)] = ingest.items()
        self.assertEqual(item_type, "event")
        [exception] = event["exception"]["values"]
        self.assertEqual(exception["type"], "RuntimeError")
        self.assertEqual(exception["value"], "reported-exception-message")
        self.assertEqual(event["release"], "reporting-test-revision")
        self.assertEqual(event["environment"], "remdo.example")
        self.assertEqual(event["request"]["url"], "https://remdo.example/fail/document-id")
        self.assertEqual(event["request"]["headers"], {"User-Agent": "reporting-test-agent"})
        self.assertNotIn("private-", json.dumps(event))
        self.assertNotIn("198.51.100.7", json.dumps(event))
