from unittest.mock import patch

from accounts.models import User
from django.test import TestCase
from workspaces import store
from workspaces.models import Workspace

from . import service as notes


class AccountRootAndReferenceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@example.test", "Owner-password-123")

    def setUp(self):
        self.workspace = Workspace.objects.create(name="Personal", owner=self.owner)

    def write(self, files):
        store.commit(
            self.workspace,
            self.owner,
            "",
            {path: (None, content.encode()) for path, content in files.items()},
        )

    def ref(self, path=""):
        return f"{self.workspace.pk}/{path}" if path else self.workspace.pk

    def test_references_name_the_account_root_workspaces_and_paths(self):
        self.write({"notes/a.md": "a\n"})

        for ref, kind in (
            ("me", "account"),
            (self.ref(), "workspace"),
            (self.ref("notes"), "folder"),
            (self.ref("notes/a.md"), "document"),
        ):
            with self.subTest(ref=ref):
                node = notes.read(self.owner, ref, depth=0)
                self.assertEqual((node["ref"], node["kind"]), (ref, kind))

    def test_malformed_and_id_references_are_refused(self):
        for ref in (
            "",
            "/a.md",
            f"{self.workspace.pk}/",
            f"{self.workspace.pk}_",
            f"{self.workspace.pk}_k3x9",
        ):
            with self.subTest(ref=ref), self.assertRaises(notes.Refusal) as refusal:
                notes.read(self.owner, ref)
            self.assertEqual(refusal.exception.code, "INVALID_ARGUMENT")

    def test_the_account_root_lists_workspaces_by_name(self):
        user = User.objects.create_user("new@example.test", "New-password-123")
        self.assertEqual(notes.read(user, depth=1)["children"], [])
        for name in ("Team", "Home"):
            Workspace.objects.create(name=name, owner=user)

        root = notes.read(user, depth=1)

        self.assertEqual((root["kind"], root["text"]), ("account", "new@example.test"))
        self.assertEqual(root["operations"], ["read", "insert"])
        self.assertEqual([child["text"] for child in root["children"]], ["Home", "Team"])

    def test_inserting_under_the_account_root_creates_a_workspace(self):
        insert = {"op": "insert", "kind": "workspace", "text": "Team"}

        preview = notes.call(self.owner, [insert], dry_run=True)
        self.assertEqual(Workspace.objects.filter(owner=self.owner).count(), 1)

        result = notes.call(self.owner, [insert])
        [created] = Workspace.objects.filter(owner=self.owner, name="Team")
        self.assertEqual(result["results"], [{"ref": created.pk, "kind": "workspace"}])
        self.assertTrue(preview["dryRun"])
        self.assertEqual(
            [child["text"] for child in notes.read(self.owner)["children"]], ["Personal", "Team"]
        )

    def test_a_new_workspace_may_come_with_its_document(self):
        result = notes.call(
            self.owner, [{"op": "insert", "kind": "workspace", "text": "Trip", "content": "- a\n"}]
        )

        [created] = result["results"]
        workspace = Workspace.objects.get(pk=created["ref"])
        self.assertEqual(store.read(workspace, "README.md").content, b"- a\n")
        self.assertEqual(result["revision"], workspace.head_id)
        self.assertEqual(
            [(change["ref"], change["change"]) for change in result["changes"]],
            [(workspace.pk, "added"), (f"{workspace.pk}/README.md", "added")],
        )

    def test_refusals_name_the_account_root_as_an_account(self):
        with self.assertRaises(notes.Refusal) as refusal:
            notes.call(self.owner, [{"op": "delete", "target": "me"}])

        self.assertEqual(str(refusal.exception), "target: an account doesn't offer delete.")

    def test_the_account_root_holds_only_workspaces(self):
        for operation, code in (
            ({"op": "insert", "kind": "document", "text": "Plan"}, "INVALID_ARGUMENT"),
            ({"op": "delete", "target": "me"}, "INVALID_ARGUMENT"),
        ):
            with self.subTest(operation=operation), self.assertRaises(notes.Refusal) as refusal:
                notes.call(self.owner, [operation])
            self.assertEqual((refusal.exception.code, refusal.exception.index), (code, 0))

    def test_a_call_stays_within_one_workspace(self):
        other = Workspace.objects.create(name="Other", owner=self.owner)
        self.write({"a.md": "a\n"})

        for operations in (
            [{"op": "move", "target": self.ref("a.md"), "parent": other.pk}],
            [
                {"op": "insert", "parent": self.ref(), "kind": "file", "text": "x"},
                {"op": "insert", "parent": other.pk, "kind": "file", "text": "y"},
            ],
        ):
            with self.subTest(operations=operations), self.assertRaises(notes.Refusal) as refusal:
                notes.call(self.owner, operations)
            self.assertEqual(refusal.exception.code, "INVALID_ARGUMENT")

    def test_other_users_workspaces_are_not_found(self):
        other = User.objects.create_user("other@example.test", "Other-password-123")

        for attempt in (
            lambda: notes.read(other, self.ref()),
            lambda: notes.call(
                other, [{"op": "insert", "parent": self.ref(), "kind": "file", "text": "x"}]
            ),
        ):
            with self.assertRaises(notes.Refusal) as refusal:
                attempt()
            self.assertEqual(refusal.exception.code, "NOT_FOUND")

    def test_a_change_notifies_the_owners_sessions_after_it_commits(self):
        insert = {"op": "insert", "kind": "workspace", "text": "Team"}
        with patch("notes.service.notify_document_list_changed") as notify:
            notes.call(self.owner, [insert], dry_run=True)
            notes.read(self.owner, depth=1)
            notify.assert_not_called()

            notes.call(self.owner, [insert])
        notify.assert_called_once_with([self.owner.pk])
