import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from accounts.models import User
from django.conf import settings
from django.test import TestCase, override_settings

from .models import Document, DocumentGrant


class HubRecorder(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.notices.append((self.path, self.headers["X-Remdo-Collaboration-Secret"], body))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


@override_settings(ALLOWED_HOSTS=["testserver"])
class DocumentListNoticeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@example.test")
        cls.grantee = User.objects.create_user("grantee@example.test")
        cls.outsider = User.objects.create_user("outsider@example.test")
        cls.document = Document.objects.get(owner=cls.owner)
        DocumentGrant.objects.create(document=cls.document, user=cls.grantee)

    def setUp(self):
        self.hub = ThreadingHTTPServer(("127.0.0.1", 0), HubRecorder)
        self.hub.notices = []
        threading.Thread(target=self.hub.serve_forever, daemon=True).start()
        self.addCleanup(self.hub.server_close)
        self.addCleanup(self.hub.shutdown)
        origin = f"http://127.0.0.1:{self.hub.server_port}"
        self.enterContext(override_settings(COLLAB_SERVER_ORIGIN=origin))
        self.client.force_login(self.owner)

    def notified(self, method, path, body=None):
        with self.captureOnCommitCallbacks(execute=True):
            response = getattr(self.client, method)(
                path, json.dumps(body or {}), content_type="application/json"
            )
        self.assertLess(response.status_code, 300)
        return [(path, secret, set(notice["userIds"])) for path, secret, notice in self.hub.notices]

    def expect(self, user_ids):
        return [
            (
                "/internal/document-list-changed",
                settings.COLLAB_INTERNAL_SECRET,
                {str(user_id) for user_id in user_ids},
            )
        ]

    def test_creation_notifies_the_owner(self):
        self.assertEqual(
            self.notified("post", "/api/documents", {"title": "New"}), self.expect([self.owner.pk])
        )

    def test_rename_notifies_owner_and_grantees(self):
        self.assertEqual(
            self.notified("put", f"/api/documents/{self.document.pk}", {"title": "Renamed"}),
            self.expect([self.owner.pk, self.grantee.pk]),
        )

    def test_deletion_notifies_owner_and_former_grantees(self):
        self.assertEqual(
            self.notified("delete", f"/api/documents/{self.document.pk}"),
            self.expect([self.owner.pk, self.grantee.pk]),
        )

    def test_new_grant_notifies_owner_and_grantee_and_repeat_grant_notifies_nobody(self):
        path = f"/api/documents/{self.document.pk}/access"
        self.assertEqual(
            self.notified("post", path, {"email": self.outsider.email}),
            self.expect([self.owner.pk, self.outsider.pk]),
        )
        self.hub.notices.clear()
        self.assertEqual(self.notified("post", path, {"email": self.outsider.email}), [])

    def test_unreachable_hub_does_not_fail_the_committed_change(self):
        self.hub.shutdown()
        self.hub.server_close()
        with self.assertLogs("documents.notices", "WARNING") as logs:
            self.notified("put", f"/api/documents/{self.document.pk}", {"title": "Renamed"})
        self.assertEqual(logs.output, ["WARNING:documents.notices:document-list notice failed"])
        self.document.refresh_from_db()
        self.assertEqual(self.document.title, "Renamed")
