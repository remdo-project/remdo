import base64
import json
from datetime import UTC, datetime
from unittest.mock import patch

from accounts.models import User
from django.conf import settings
from django.contrib.auth.models import Permission
from django.db import DatabaseError
from django.test import Client, TestCase, override_settings

from . import store, text_format
from .models import Blob, DocumentState, Revision, Workspace

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
        self.authorize_url = f"/internal/collaboration/workspaces/{self.workspace.pk}/authorize"
        self.content = f"/internal/collaboration/workspaces/{self.workspace.pk}/content"
        self.headers = {"HTTP_X_REMDO_COLLABORATION_SECRET": settings.COLLAB_INTERNAL_SECRET}

    def load(self):
        response = self.client.get(self.content, **self.headers)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def save(self, tree, version, state=b"state", commit=True, url=None):
        body = {
            "state": base64.b64encode(state).decode(),
            "tree": tree,
            "version": version,
            "commit": commit,
        }
        return self.client.put(
            url or self.content,
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
                self.authorize_url, HTTP_ORIGIN="https://app.example", **self.headers
            )

        self.assertEqual(authorize(self.owner).json(), {"userId": str(self.owner.pk)})
        self.assertEqual(authorize(self.other).status_code, 403)
        self.owner.user_permissions.clear()
        self.owner = User.objects.get(pk=self.owner.pk)
        self.assertEqual(authorize(self.owner).status_code, 403)

    def test_integrations_and_operators_cannot_open_the_room(self):
        with patch("accounts.delegated.delegated_user", return_value=self.owner):
            bearer = self.client.get(
                self.authorize_url, HTTP_AUTHORIZATION="Bearer token", **self.headers
            )
        operator = self.client.get(
            self.authorize_url, HTTP_X_REMDO_COLLABORATION_OPERATOR="1", **self.headers
        )

        self.assertEqual([bearer.status_code, operator.status_code], [403, 403])

    def test_an_empty_workspace_loads_and_saves_without_writing_a_file(self):
        self.assertEqual(
            self.load(), {"version": None, "state": None, "uncommittedSince": None, "tree": EMPTY}
        )

        self.assertEqual(self.save(EMPTY, None).json(), {"version": None})

        self.assertIsNone(self.readme().blob_hash)
        self.assertFalse(Revision.objects.filter(workspace=self.workspace).exists())
        self.assertEqual(
            self.load(),
            {
                "version": None,
                "state": base64.b64encode(b"state").decode(),
                "uncommittedSince": None,
            },
        )

    def test_a_save_keeps_its_text_in_the_row_and_leaves_the_file(self):
        with patch("django.utils.timezone.now", return_value=datetime(2026, 11, 13, tzinfo=UTC)):
            self.save(tree_of("- one\n"), None, b"first", commit=False)
        self.save(tree_of("- one\n- two\n"), None, b"second", commit=False)

        row = DocumentState.objects.get(workspace=self.workspace)
        self.assertEqual((bytes(row.state), row.text), (b"second", "- one\n- two\n"))
        self.assertEqual(row.uncommitted_since, datetime(2026, 11, 13, tzinfo=UTC))
        self.assertIsNone(self.readme().blob_hash)
        self.assertFalse(Revision.objects.filter(workspace=self.workspace).exists())
        self.assertEqual(self.load()["uncommittedSince"], "2026-11-13T00:00:00+00:00")

        self.save(EMPTY, None, commit=False)

        self.assertIsNone(DocumentState.objects.get(workspace=self.workspace).uncommitted_since)

    def test_a_commit_writes_the_trees_text_and_its_state_together(self):
        self.save(tree_of("- one\n"), None, commit=False)

        response = self.save(tree_of("- one\n- two\n"), None, b"saved")

        file = self.readme()
        self.assertEqual(file.content, b"- one\n- two\n")
        self.assertEqual(response.json(), {"version": file.blob_hash})
        self.assertEqual(Revision.objects.get(workspace=self.workspace).author, self.owner)
        row = DocumentState.objects.get(workspace=self.workspace)
        self.assertEqual((bytes(row.state), row.blob_id), (b"saved", file.blob_hash))
        self.assertIsNone(row.uncommitted_since)

    def test_a_save_that_changes_no_text_updates_only_the_state(self):
        version = self.save(tree_of("- one\n"), None).json()["version"]

        self.save(tree_of("- one\n"), version, b"folded")

        self.assertEqual(Revision.objects.filter(workspace=self.workspace).count(), 1)
        self.assertEqual(
            bytes(DocumentState.objects.get(workspace=self.workspace).state), b"folded"
        )

    def test_a_save_keeps_the_files_spelling_while_it_reads_the_same(self):
        changed = store.commit(self.workspace, self.owner, "agent", {"README.md": (None, b"* a\n")})
        loaded = self.load()

        self.save(loaded["tree"], loaded["version"])

        self.assertEqual(self.readme().content, b"* a\n")
        self.assertEqual(Workspace.objects.get(pk=self.workspace.pk).head, changed)

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

    def test_a_save_after_a_commit_whose_reply_was_lost_isnt_stale(self):
        self.save(tree_of("- one\n"), None)

        response = self.save(tree_of("- one\n- two\n"), None)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.readme().content, b"- one\n- two\n")

    def test_a_load_after_the_file_changed_includes_its_tree(self):
        version = self.save(tree_of("- one\n"), None).json()["version"]
        store.commit(self.workspace, self.owner, "agent", {"README.md": (version, b"- agent\n")})

        loaded = self.load()

        self.assertEqual(loaded["tree"], tree_of("- agent\n"))
        self.assertEqual(loaded["version"], self.readme().blob_hash)

    def test_the_state_goes_with_its_workspace(self):
        version = self.save(tree_of("- one\n"), None).json()["version"]

        self.workspace.delete()

        self.assertFalse(DocumentState.objects.exists())
        self.assertFalse(Blob.objects.filter(hash=version).exists())

    def test_saves_and_loads_that_cant_succeed_are_refused_and_reported(self):
        store.commit(self.workspace, self.owner, "agent", {"README.md": (None, b"- a\n")})
        version = self.readme().blob_hash
        with (
            override_settings(SENTRY_DSN="https://public@example.invalid/1"),
            patch("sentry_sdk.capture_message") as report,
            patch("workspaces.internal.FILE_MAX_BYTES", 8),
        ):
            too_large = self.save(tree_of("- longer than eight bytes\n"), version)
            malformed = self.save({"id": None}, version)
            store.commit(self.workspace, self.owner, "agent", {"README.md": (version, b"\xff\n")})
            unreadable = self.client.get(self.content, **self.headers)

        self.assertEqual(
            [(r.status_code, r.json()) for r in (too_large, malformed, unreadable)],
            [(422, {"code": code}) for code in ("TOO_LARGE", "MALFORMED", "UNREADABLE")],
        )
        self.assertEqual(
            [call.kwargs["tags"] for call in report.call_args_list],
            [{"workspace.refusal": code} for code in ("TOO_LARGE", "MALFORMED", "UNREADABLE")],
        )
        self.assertEqual(Revision.objects.filter(workspace=self.workspace).count(), 2)
        self.assertFalse(DocumentState.objects.exists())

    def test_a_starting_hub_commits_rows_holding_text_their_file_lacks(self):
        stale = Workspace.objects.create(name="Stale", owner=self.owner)
        for url in (self.content, f"/internal/collaboration/workspaces/{stale.pk}/content"):
            self.save(tree_of("- typed\n"), None, commit=False, url=url)
        store.commit(stale, self.owner, "agent", {"README.md": (None, b"- agent\n")})

        response = self.client.post(
            "/internal/collaboration/workspaces/commit-pending", **self.headers
        )

        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.readme().content, b"- typed\n")
        self.assertEqual(Revision.objects.get(workspace=self.workspace).author, self.owner)
        self.assertIsNone(DocumentState.objects.get(workspace=self.workspace).uncommitted_since)
        self.assertEqual(store.read(stale, "README.md").content, b"- agent\n")
        self.assertIsNotNone(DocumentState.objects.get(workspace=stale).uncommitted_since)

    def test_a_failed_state_write_leaves_no_revision(self):
        with (
            patch.object(DocumentState.objects, "update_or_create", side_effect=DatabaseError),
            self.assertRaises(DatabaseError),
        ):
            self.save(tree_of("- one\n"), None)

        self.assertIsNone(self.readme().blob_hash)
        self.assertFalse(Revision.objects.filter(workspace=self.workspace).exists())
