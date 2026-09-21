from unittest.mock import patch

from accounts.models import User
from django.conf import settings
from django.db import OperationalError
from django.test import Client, TestCase, override_settings

from .models import Document, DocumentContent, DocumentGrant


@override_settings(CSRF_TRUSTED_ORIGINS=["https://app.example"])
class CollaborationStorageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@example.test")
        cls.grantee = User.objects.create_user("grantee@example.test")
        cls.document = Document.objects.get(owner=cls.owner)
        DocumentGrant.objects.create(document=cls.document, user=cls.grantee)

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.base = f"/internal/collaboration/documents/{self.document.pk}"
        self.headers = {"HTTP_X_REMDO_COLLABORATION_SECRET": settings.COLLAB_INTERNAL_SECRET}

    def put(self, state):
        return self.client.put(
            self.base + "/content", state, content_type="application/octet-stream", **self.headers
        )

    def test_binary_state_round_trip_replacement_and_cascade(self):
        self.assertEqual(self.client.get(self.base + "/content", **self.headers).content, b"")
        self.assertFalse(DocumentContent.objects.exists())
        for state in (b"\x00\xff\x80binary", b"\x01replacement"):
            self.assertEqual(self.put(state).status_code, 204)
            response = self.client.get(self.base + "/content", **self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.content, state)
            self.assertEqual(response["Content-Type"], "application/octet-stream")
            self.assertIn("no-store", response["Cache-Control"])
        self.assertEqual(DocumentContent.objects.count(), 1)
        self.document.delete()
        self.assertFalse(DocumentContent.objects.exists())
        self.assertEqual(self.client.get(self.base + "/content", **self.headers).status_code, 404)
        self.assertEqual(self.put(b"orphan").status_code, 404)

    @override_settings(DATA_UPLOAD_MAX_MEMORY_SIZE=32)
    def test_binary_storage_does_not_apply_form_body_limit(self):
        state = bytes(range(256)) * 16384
        self.assertEqual(self.put(state).status_code, 204)
        self.assertEqual(self.client.get(self.base + "/content", **self.headers).content, state)

    def test_database_failure_does_not_return_empty_state_or_claim_save_success(self):
        self.put(b"previous")
        with patch(
            "documents.internal.DocumentContent.objects.filter", side_effect=OperationalError
        ):
            with self.assertRaises(OperationalError):
                self.client.get(self.base + "/content", **self.headers)
        with patch(
            "documents.internal.DocumentContent.objects.update_or_create",
            side_effect=OperationalError,
        ):
            with self.assertRaises(OperationalError):
                self.put(b"replacement")
        self.assertEqual(
            self.client.get(self.base + "/content", **self.headers).content, b"previous"
        )

    def test_internal_secret_required_for_every_operation(self):
        self.client.force_login(self.owner)
        for secret in ("", "wrong", "é"):
            headers = {"HTTP_X_REMDO_COLLABORATION_SECRET": secret}
            self.assertEqual(self.client.get(self.base + "/content", **headers).status_code, 403)
            self.assertEqual(
                self.client.put(
                    self.base + "/content",
                    b"bad",
                    content_type="application/octet-stream",
                    **headers,
                ).status_code,
                403,
            )
            self.assertEqual(
                self.client.get(
                    self.base + "/authorize", HTTP_X_REMDO_COLLABORATION_OPERATOR="1", **headers
                ).status_code,
                403,
            )
        self.assertFalse(DocumentContent.objects.exists())

    def test_browser_authorization_requires_origin_and_live_access(self):
        for user in (self.owner, self.grantee):
            self.client.force_login(user)
            response = self.client.get(
                self.base + "/authorize", HTTP_ORIGIN="https://app.example", **self.headers
            )
            self.assertEqual(response.json(), {"userId": str(user.pk)})
            for origin in ("", "https://attacker.example", "null"):
                self.assertEqual(
                    self.client.get(
                        self.base + "/authorize", HTTP_ORIGIN=origin, **self.headers
                    ).status_code,
                    403,
                )
        DocumentGrant.objects.all().delete()
        self.assertEqual(
            self.client.get(
                self.base + "/authorize", HTTP_ORIGIN="https://app.example", **self.headers
            ).status_code,
            403,
        )
        self.client.logout()
        self.assertEqual(
            self.client.get(
                self.base + "/authorize", HTTP_ORIGIN="https://app.example", **self.headers
            ).status_code,
            403,
        )

    def test_operator_requires_existing_document_but_no_browser_session(self):
        headers = {**self.headers, "HTTP_X_REMDO_COLLABORATION_OPERATOR": "1"}
        self.assertEqual(
            self.client.get(self.base + "/authorize", **headers).json(), {"operator": True}
        )
        self.assertEqual(
            self.client.get(
                "/internal/collaboration/documents/unknown/authorize", **headers
            ).status_code,
            404,
        )

    def test_store_rejects_nonbinary_body_and_wrong_method(self):
        self.assertEqual(
            self.client.put(
                self.base + "/content", "{}", content_type="application/json", **self.headers
            ).status_code,
            415,
        )
        self.assertEqual(self.client.post(self.base + "/content", **self.headers).status_code, 405)
        self.assertFalse(DocumentContent.objects.exists())
