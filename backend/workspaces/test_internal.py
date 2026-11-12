import base64
import json
from unittest.mock import patch

from accounts.models import User
from django.conf import settings
from django.contrib.auth.models import Permission
from django.db import DatabaseError
from django.test import Client, TestCase, override_settings

from . import store, text_format
from .models import DocumentState, Revision, Workspace

EMPTY = {"id": None, "children": []}


def tree_of(text):
    return text_format.to_json(text_format.read(text))


@override_settings(CSRF_TRUSTED_ORIGINS=["https://app.example"])
class WorkspaceRoomTests(TestCase):
    """The hub's loads and saves of a workspace's document, through the internal endpoints."""

    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@example.test")
        cls.owner.user_permissions.add(Permission.objects.get(codename="use_workspaces"))
        cls.other = User.objects.create_user("other@example.test")
        cls.other.user_permissions.add(Permission.objects.get(codename="use_workspaces"))

    def setUp(self):
        self.workspace = Workspace.objects.create(name="Notes", owner=self.owner)
        self.client = Client(enforce_csrf_checks=True)
        self.base = f"/internal/collaboration/documents/{self.workspace.pk}"
        self.headers = {"HTTP_X_REMDO_COLLABORATION_SECRET": settings.COLLAB_INTERNAL_SECRET}

    def load(self):
        response = self.client.get(self.base + "/content", **self.headers)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def save(self, tree, version, state=b"state"):
        body = {"state": base64.b64encode(state).decode(), "tree": tree, "version": version}
        return self.client.put(
            self.base + "/content",
            json.dumps(body),
            content_type="application/json",
            **self.headers,
        )

    def readme(self):
        return store.read(self.workspace, "README.md")

    def test_only_the_owner_with_workspaces_may_open_the_room(self):
        def authorize(user):
            self.client.force_login(user)
            return self.client.get(
                self.base + "/authorize", HTTP_ORIGIN="https://app.example", **self.headers
            )

        self.assertEqual(
            authorize(self.owner).json(), {"userId": str(self.owner.pk), "workspace": True}
        )
        self.assertEqual(authorize(self.other).status_code, 403)
        self.owner.user_permissions.clear()
        self.owner = User.objects.get(pk=self.owner.pk)
        self.assertEqual(authorize(self.owner).status_code, 403)

    def test_an_empty_workspace_loads_and_saves_without_writing_a_file(self):
        self.assertEqual(self.load(), {"version": None, "state": None, "tree": EMPTY})

        self.assertEqual(self.save(EMPTY, None).json(), {"version": None})

        self.assertIsNone(self.readme().blob_hash)
        self.assertFalse(Revision.objects.filter(workspace=self.workspace).exists())
        self.assertEqual(
            self.load(), {"version": None, "state": base64.b64encode(b"state").decode()}
        )

    def test_a_save_writes_the_trees_text_and_its_state_together(self):
        response = self.save(tree_of("- one\n- two\n"), None, b"saved")

        file = self.readme()
        self.assertEqual(file.content, b"- one\n- two\n")
        self.assertEqual(response.json(), {"version": file.blob_hash})
        self.assertEqual(Revision.objects.get(workspace=self.workspace).author, self.owner)
        row = DocumentState.objects.get(workspace=self.workspace)
        self.assertEqual((bytes(row.state), row.blob_id), (b"saved", file.blob_hash))

    def test_a_save_that_changes_no_text_updates_only_the_state(self):
        version = self.save(tree_of("- one\n"), None).json()["version"]

        self.save(tree_of("- one\n"), version, b"folded")

        self.assertEqual(Revision.objects.filter(workspace=self.workspace).count(), 1)
        self.assertEqual(
            bytes(DocumentState.objects.get(workspace=self.workspace).state), b"folded"
        )

    def test_a_stale_save_writes_nothing_and_returns_the_current_file(self):
        version = self.save(tree_of("- one\n"), None, b"first").json()["version"]
        changed = store.commit(
            self.workspace, self.owner, "agent", {"README.md": (version, b"- agent\n")}
        )

        response = self.save(tree_of("- typed\n"), version, b"second")

        current = self.readme()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json(), {"version": current.blob_hash, "tree": tree_of("- agent\n")}
        )
        self.assertEqual(current.content, b"- agent\n")
        self.assertEqual(Workspace.objects.get(pk=self.workspace.pk).head, changed)
        self.assertEqual(bytes(DocumentState.objects.get(workspace=self.workspace).state), b"first")

    def test_a_load_after_the_file_changed_includes_its_tree(self):
        version = self.save(tree_of("- one\n"), None).json()["version"]
        store.commit(self.workspace, self.owner, "agent", {"README.md": (version, b"- agent\n")})

        loaded = self.load()

        self.assertEqual(loaded["tree"], tree_of("- agent\n"))
        self.assertEqual(loaded["version"], self.readme().blob_hash)

    def test_a_failed_state_write_leaves_no_revision(self):
        with (
            patch.object(DocumentState.objects, "update_or_create", side_effect=DatabaseError),
            self.assertRaises(DatabaseError),
        ):
            self.save(tree_of("- one\n"), None)

        self.assertIsNone(self.readme().blob_hash)
        self.assertFalse(Revision.objects.filter(workspace=self.workspace).exists())
