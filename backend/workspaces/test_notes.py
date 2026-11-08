from unittest import mock

from accounts.models import User
from django.test import TestCase
from notes import service as notes

from . import source, store
from .models import Blob, Workspace

DOC = "# Plan\n\n- step\n    - id:: k3x9\n"
OTHER = "- other\n  - id:: p7q2\n"

# Each case: files before, what the caller read, operations, then files after or the refusal.
# A read entry ending in "/" is a folder; "" names the whole workspace.
CASES = {
    "insert a document with content": dict(
        before={"notes/a.md": "a\n"},
        ops=[
            {
                "op": "insert",
                "parent": "notes",
                "kind": "document",
                "text": "Plan",
                "content": "# Plan\n",
            }
        ],
        after={"notes/a.md": "a\n", "notes/Plan.md": "# Plan\n"},
    ),
    "insert a document carrying an ID": dict(
        ops=[{"op": "insert", "parent": "", "kind": "document", "text": "Plan", "content": DOC}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "insert where a name differs only by case": dict(
        before={"Plan.md": "a\n"},
        ops=[{"op": "insert", "parent": "", "kind": "document", "text": "plan"}],
        refused=("FAILED_PRECONDITION", 0),
    ),
    "insert a file named like a document": dict(
        ops=[{"op": "insert", "parent": "", "kind": "file", "text": "a.md"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "move a document keeps its content and IDs": dict(
        before={"plan.md": DOC, "archive/old.md": "old\n"},
        read=["plan.md"],
        ops=[{"op": "move", "target": "plan.md", "parent": "archive"}],
        after={"archive/plan.md": DOC, "archive/old.md": "old\n"},
    ),
    "move a folder into itself": dict(
        before={"a/x.md": "x\n"},
        read=["a/"],
        ops=[{"op": "move", "target": "a", "parent": "a"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "rename a folder renames everything under it": dict(
        before={"a/x.md": "x\n", "a/b/y.png": "y", "ab.md": "beside\n"},
        read=["a/"],
        ops=[{"op": "setText", "target": "a", "text": "c"}],
        after={"c/x.md": "x\n", "c/b/y.png": "y", "ab.md": "beside\n"},
    ),
    "rename a folder onto another folder": dict(
        before={"a/x.md": "x\n", "b/y.md": "y\n"},
        read=["a/"],
        ops=[{"op": "setText", "target": "a", "text": "b"}],
        refused=("FAILED_PRECONDITION", 0),
    ),
    "move a folder beside a folder of its name": dict(
        before={"a/x.md": "x\n", "c/a/y.md": "y\n"},
        read=["a/"],
        ops=[{"op": "move", "target": "a", "parent": "c"}],
        refused=("FAILED_PRECONDITION", 0),
    ),
    "rename a document by replacement": dict(
        before={"Plan draft.md": "a\n"},
        read=["Plan draft.md"],
        ops=[
            {
                "op": "setText",
                "target": "Plan draft.md",
                "replacements": [{"old": " draft", "new": ""}],
            }
        ],
        after={"Plan.md": "a\n"},
    ),
    "rename a file into a document": dict(
        before={"a.txt": "a\n"},
        read=["a.txt"],
        ops=[{"op": "setText", "target": "a.txt", "text": "a.md"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "rename to the same name composed differently": dict(
        before={"caf\u00e9.md": "a\n"},
        read=["caf\u00e9.md"],
        ops=[{"op": "setText", "target": "caf\u00e9.md", "text": "cafe\u0301"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "set text to the same text": dict(
        before={"a.md": "a\n"},
        read=["a.md"],
        ops=[{"op": "setText", "target": "a.md", "text": "a"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "delete a folder needs withChildren": dict(
        before={"a/x.md": "x\n"},
        read=["a/"],
        ops=[{"op": "delete", "target": "a"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "delete a folder with its children": dict(
        before={"a/x.md": DOC, "a/y.md": OTHER, "b.md": "b\n"},
        read=["a/"],
        ops=[{"op": "delete", "target": "a", "withChildren": True}],
        after={"b.md": "b\n"},
        results=[{"removedIds": ["k3x9", "p7q2"]}],
    ),
    "delete a document with content needs withChildren": dict(
        before={"a.md": "- a\n"},
        read=["a.md"],
        ops=[{"op": "delete", "target": "a.md"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "delete a document holding only its ID": dict(
        before={"a.md": "- id:: k3x9\n", "b.txt": "b\n"},
        read=["a.md"],
        ops=[{"op": "delete", "target": "a.md"}],
        after={"b.txt": "b\n"},
        results=[{"removedIds": ["k3x9"]}],
    ),
    "set content by exact replacement": dict(
        before={"a.md": DOC},
        read=["a.md"],
        ops=[
            {
                "op": "setContent",
                "target": "a.md",
                "replacements": [{"old": "- step", "new": "- first step"}],
            }
        ],
        after={"a.md": DOC.replace("- step", "- first step")},
    ),
    "a replacement matching twice": dict(
        before={"a.md": "- x\n- x\n"},
        read=["a.md"],
        ops=[
            {
                "op": "setContent",
                "target": "a.md",
                "replacements": [{"old": "- x", "new": "- y"}],
            }
        ],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "set content removing an ID": dict(
        before={"a.md": DOC},
        read=["a.md"],
        ops=[{"op": "setContent", "target": "a.md", "content": "# Plan\n"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "a file changed since it was read": dict(
        before={"a.md": "a\n"},
        read=["a.md"],
        changed_after_read={"a.md": "theirs\n"},
        ops=[{"op": "setContent", "target": "a.md", "content": "mine\n"}],
        refused=("FAILED_PRECONDITION", 0),
    ),
    "a file changed under a folder since it was read": dict(
        before={"a/x.md": "x\n"},
        read=["a/"],
        changed_after_read={"a/x.md": "theirs\n"},
        ops=[{"op": "delete", "target": "a", "withChildren": True}],
        refused=("FAILED_PRECONDITION", 0),
    ),
    "the workspace's version covers every file": dict(
        before={"a/x.md": "- x\n", "b.txt": "b\n"},
        read=[""],
        ops=[{"op": "delete", "target": "a", "withChildren": True}],
        after={"b.txt": "b\n"},
    ),
    "a folder change needs its listing version, not only its files' versions": dict(
        before={"a/x.md": "x\n"},
        read=["a/x.md"],
        ops=[{"op": "setText", "target": "a", "text": "c"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "the deepest folder read vouches for its files": dict(
        before={"a/x.md": "- x\n", "b.md": "b\n"},
        read=["", "a/"],
        changed_after_read={"b.md": "theirs\n"},
        ops=[{"op": "delete", "target": "a", "withChildren": True}],
        after={"b.md": "theirs\n"},
    ),
    "set content without content or replacements": dict(
        before={"a.txt": "a\n"},
        read=["a.txt"],
        ops=[{"op": "setContent", "target": "a.txt"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "set content with text that isn't valid Unicode": dict(
        before={"a.txt": "a\n"},
        read=["a.txt"],
        ops=[{"op": "setContent", "target": "a.txt", "content": "\ud800"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "set content removing an ID on a CRLF line": dict(
        before={"a.md": "- a\r\n  - id:: k3x9\r\n"},
        read=["a.md"],
        ops=[{"op": "setContent", "target": "a.md", "content": "- a\r\n"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "a change without the version read": dict(
        before={"a.md": "a\n"},
        ops=[{"op": "setContent", "target": "a.md", "content": "b\n"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "later operations name notes created earlier": dict(
        before={"archive/old.md": "old\n"},
        ops=[
            {"op": "insert", "parent": "", "kind": "document", "text": "Plan", "content": "- a\n"},
            {"op": "setContent", "target": "Plan.md", "content": "- b\n"},
            {"op": "move", "target": "Plan.md", "parent": "archive"},
        ],
        after={"archive/old.md": "old\n", "archive/Plan.md": "- b\n"},
    ),
    "a refused operation undoes the whole call": dict(
        before={"a.md": "a\n"},
        read=["a.md"],
        ops=[
            {"op": "insert", "parent": "", "kind": "document", "text": "b"},
            {"op": "delete", "target": "a.md", "withChildren": True},
            {"op": "delete", "target": "missing.md"},
        ],
        refused=("NOT_FOUND", 2),
    ),
}


class MultiFileNoteOperationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@example.test", "Owner-password-123")

    def setUp(self):
        self.enterContext(mock.patch.object(source.WorkspaceCall, "single_file", False))
        self.workspace = Workspace.objects.create(name="Personal", owner=self.owner)

    def write(self, files):
        if files:
            store.commit(
                self.workspace,
                self.owner,
                "",
                {
                    path: (store.read(self.workspace, path).blob_hash, content.encode())
                    for path, content in files.items()
                },
            )

    def change(self, operations, expected=None, dry_run=False):
        """Run a call on this workspace; cases name notes by their path in it."""
        scoped = [
            {
                **operation,
                **{
                    field: self.ref(operation[field])
                    for field in ("target", "parent")
                    if field in operation
                },
            }
            for operation in operations
        ]
        return notes.call(self.owner, scoped, expected, dry_run)

    def files(self):
        return {
            path: store.read(self.workspace, path).content.decode()
            for path in store.list_paths(self.workspace).files
        }

    def versions(self, reads):
        expected = {}
        for read in reads:
            if read.endswith("/") or read == "":
                folder = read.rstrip("/")
                expected[self.ref(folder)] = store.list_paths(self.workspace, folder).version
            else:
                expected[self.ref(read)] = store.read(self.workspace, read).blob_hash
        return expected

    def test_cases(self):
        for name, case in CASES.items():
            with self.subTest(name):
                Workspace.objects.filter(pk=self.workspace.pk).delete()
                self.workspace = Workspace.objects.create(name="Personal", owner=self.owner)
                self.write(case.get("before"))
                expected = self.versions(case.get("read", []))
                self.write(case.get("changed_after_read"))
                before = self.files()

                if "refused" in case:
                    with self.assertRaises(notes.Refusal) as refusal:
                        self.change(case["ops"], expected)
                    self.assertEqual(
                        (refusal.exception.code, refusal.exception.index), case["refused"]
                    )
                    self.assertEqual(self.files(), before)
                    continue
                result = self.change(case["ops"], expected)
                self.assertEqual(self.files(), case["after"])
                if "results" in case:
                    self.assertEqual(result["results"], case["results"])

    def test_stale_refusal_returns_the_current_version(self):
        self.write({"a.md": "a\n"})
        expected = self.versions(["a.md"])
        self.write({"a.md": "theirs\n"})

        with self.assertRaises(notes.Refusal) as refusal:
            self.change(
                [{"op": "delete", "target": "a.md", "withChildren": True}],
                expected,
            )

        current = store.read(self.workspace, "a.md").blob_hash
        self.assertEqual(refusal.exception.versions, {self.ref("a.md"): current})

    def test_success_returns_results_references_and_new_versions(self):
        result = self.change(
            [
                {
                    "op": "insert",
                    "parent": "",
                    "kind": "document",
                    "text": "Plan",
                    "content": "- a\n",
                }
            ],
        )

        version = store.read(self.workspace, "Plan.md").blob_hash
        ref = self.ref("Plan.md")
        self.assertEqual(result["results"], [{"ref": ref, "kind": "document"}])
        self.assertEqual(result["changes"], [{"ref": ref, "change": "added", "version": version}])
        self.workspace.refresh_from_db()
        self.assertEqual(result["revision"], self.workspace.head_id)

    def test_dry_run_describes_the_change_and_changes_nothing(self):
        self.write({"a.md": "- a\n"})
        head = self.workspace.head_id

        result = self.change(
            [{"op": "setContent", "target": "a.md", "content": "- b\n"}],
            self.versions(["a.md"]),
            dry_run=True,
        )

        self.assertEqual(self.files(), {"a.md": "- a\n"})
        self.assertEqual(self.workspace.head_id, head)
        self.assertIsNone(result["revision"])
        self.assertIn("-- a\n+- b\n", result["changes"][0]["diff"])

    def test_a_call_that_changes_nothing_makes_no_revision(self):
        self.write({"a.md": "a\n"})
        head = self.workspace.head_id

        result = self.change(
            [{"op": "move", "target": "a.md", "parent": ""}],
            self.versions(["a.md"]),
        )

        self.assertEqual(result["changes"], [])
        self.assertEqual(Workspace.objects.get(pk=self.workspace.pk).head_id, head)

    def test_renaming_the_workspace_changes_no_files(self):
        rename = [{"op": "setText", "target": "", "text": "Work"}]
        ref = self.ref()
        renamed = [{"ref": ref, "change": "renamed", "text": "Work"}]

        preview = self.change(rename, dry_run=True)
        self.assertEqual(preview["changes"], renamed)
        self.assertEqual(Workspace.objects.get(pk=self.workspace.pk).name, "Personal")

        result = self.change(rename)
        self.assertEqual(result["changes"], renamed)
        self.assertEqual(Workspace.objects.get(pk=self.workspace.pk).name, "Work")
        self.assertIsNone(self.workspace.head_id)

    def test_a_taken_path_refusal_returns_what_occupies_it(self):
        self.write({"Plan.md": "- a\n", "notes/x.md": "x\n"})

        for kind, text, versions in (
            (
                "document",
                "plan",
                {self.ref("Plan.md"): store.read(self.workspace, "Plan.md").blob_hash},
            ),
            (
                "file",
                "notes",
                {self.ref("notes"): store.list_paths(self.workspace, "notes").version},
            ),
        ):
            with self.subTest(text=text), self.assertRaises(notes.Refusal) as refusal:
                self.change([{"op": "insert", "parent": "", "kind": kind, "text": text}])
            self.assertEqual(refusal.exception.versions, versions)

    def test_a_path_taken_by_a_concurrent_change_is_a_failed_precondition(self):
        call = source.open_call(self.owner, self.workspace.pk)
        self.write({"Plan.md": "theirs\n"})

        with self.assertRaises(notes.Refusal) as refusal:
            call.run(
                [{"op": "insert", "parent": self.ref(), "kind": "document", "text": "plan"}],
                False,
            )
        theirs = store.read(self.workspace, "Plan.md").blob_hash
        self.assertEqual(
            (refusal.exception.code, refusal.exception.index, refusal.exception.versions),
            ("FAILED_PRECONDITION", 0, {self.ref("Plan.md"): theirs}),
        )

    def test_a_folder_a_concurrent_change_creates_blocks_a_rename_onto_it(self):
        self.write({"old/a.txt": "a\n"})
        expected = self.versions(["old/"])
        call = source.open_call(self.owner, self.workspace.pk, expected)
        self.write({"new/b.txt": "theirs\n"})

        with self.assertRaises(notes.Refusal) as refusal:
            call.run([{"op": "setText", "target": self.ref("old"), "text": "new"}], False)

        self.assertEqual(
            (refusal.exception.code, refusal.exception.index, refusal.exception.versions),
            (
                "FAILED_PRECONDITION",
                0,
                {self.ref("new"): store.list_paths(self.workspace, "new").version},
            ),
        )
        self.assertEqual(self.files(), {"old/a.txt": "a\n", "new/b.txt": "theirs\n"})

    def test_expected_entries_for_other_notes_are_ignored(self):
        other = Workspace.objects.create(name="Other", owner=self.owner)
        self.write({"a.md": "a\n"})
        expected = {
            **self.versions(["a.md"]),
            f"{other.pk}/x.md": "stale",
            f"{self.workspace.pk}_k3x9": "stale",
        }

        self.change([{"op": "setContent", "target": "a.md", "content": "b\n"}], expected)

        self.assertEqual(self.files(), {"a.md": "b\n"})

    def test_a_move_past_the_path_limit_blames_the_parent(self):
        deep = "/".join(["d" * 40] * 4)
        self.write({f"{deep}/x.md": "x\n", "long/" + "n" * 60 + ".md": "n\n"})

        with self.assertRaises(notes.Refusal) as refusal:
            self.change(
                [{"op": "move", "target": "long", "parent": deep}],
                {self.ref("long"): store.list_paths(self.workspace, "long").version},
            )

        self.assertTrue(str(refusal.exception).startswith("parent: "), refusal.exception)

    def test_read_lists_children_by_name_with_versions(self):
        self.write({"b.md": "- b\n", "a/x.png": "x", "c.txt": "", "empty.md": ""})

        node = notes.read(self.owner, self.ref(), depth=1)

        self.assertEqual(node["kind"], "workspace")
        self.assertEqual(node["text"], "Personal")
        self.assertEqual(node["version"], store.list_paths(self.workspace).version)
        self.assertEqual(
            [
                (child["ref"], child["kind"], child["text"], child.get("hasChildren"))
                for child in node["children"]
            ],
            [
                (self.ref("a"), "folder", "a", True),
                (self.ref("b.md"), "document", "b", None),
                (self.ref("c.txt"), "file", "c.txt", False),
                (self.ref("empty.md"), "document", "empty", None),
            ],
        )
        self.assertEqual(
            node["children"][1]["operations"], ["read", "move", "delete", "setText", "setContent"]
        )

    def test_read_returns_content_when_asked(self):
        store.commit(
            self.workspace,
            self.owner,
            "",
            {"a.md": (None, "- café\n".encode()), "b.bin": (None, b"\xff\x00")},
        )

        document = notes.read(self.owner, self.ref("a.md"), content=True)
        binary = notes.read(self.owner, self.ref("b.bin"), content=True)

        self.assertEqual((document["content"], document["contentEncoding"]), ("- café\n", "utf8"))
        self.assertEqual((binary["content"], binary["contentEncoding"]), ("/wA=", "base64"))
        self.assertNotIn("content", notes.read(self.owner, self.ref("a.md")))

    def ref(self, path=""):
        return f"{self.workspace.pk}/{path}" if path else self.workspace.pk


class SingleFileWorkspaceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@example.test", "Owner-password-123")

    def setUp(self):
        self.workspace = Workspace.objects.create(name="Trip", owner=self.owner)
        self.readme = f"{self.workspace.pk}/README.md"

    def set_content(self, content, version):
        return notes.call(
            self.owner,
            [{"op": "setContent", "target": self.readme, "content": content}],
            {self.readme: version},
        )

    def test_a_workspace_holds_its_readme_which_reads_empty_until_saved(self):
        node = notes.read(self.owner, self.workspace.pk, depth=1)

        self.assertEqual(node["operations"], ["read", "delete", "setText"])
        [document] = node["children"]
        self.assertEqual(
            (document["ref"], document["kind"], document["text"], document["version"]),
            (self.readme, "document", "README", None),
        )
        self.assertEqual(document["operations"], ["read", "setContent"])
        self.assertEqual(notes.read(self.owner, self.readme, content=True)["content"], "")

    def test_the_first_save_creates_the_readme_and_a_stale_one_is_refused(self):
        self.set_content("- a\n", None)

        self.assertEqual(store.read(self.workspace, "README.md").content, b"- a\n")
        with self.assertRaises(notes.Refusal) as refusal:
            self.set_content("- mine\n", None)
        current = store.read(self.workspace, "README.md").blob_hash
        self.assertEqual(
            (refusal.exception.code, refusal.exception.versions),
            ("FAILED_PRECONDITION", {self.readme: current}),
        )

    def test_a_save_after_a_concurrent_deletion_finds_the_workspace_missing(self):
        changes = source.Tree.changes

        def deleted_meanwhile(tree):
            Workspace.objects.filter(pk=self.workspace.pk).delete()
            return changes(tree)

        with (
            mock.patch.object(source.Tree, "changes", deleted_meanwhile),
            self.assertRaises(notes.Refusal) as refusal,
        ):
            self.set_content("- a\n", None)
        self.assertEqual(refusal.exception.code, "NOT_FOUND")

    def test_a_workspace_adds_and_renames_no_files(self):
        self.set_content("- a\n", None)

        for operation in (
            {"op": "insert", "parent": self.workspace.pk, "kind": "document", "text": "Plan"},
            {"op": "setText", "target": self.readme, "text": "Plan"},
            {"op": "delete", "target": self.readme, "withChildren": True},
        ):
            with self.subTest(op=operation["op"]), self.assertRaises(notes.Refusal) as refusal:
                notes.call(self.owner, [operation])
            self.assertEqual(refusal.exception.code, "INVALID_ARGUMENT")

    def test_deleting_a_workspace_deletes_its_history(self):
        store.commit(
            self.workspace, self.owner, "", {"README.md": (None, b"- a\n    - id:: k3x9\n")}
        )
        delete = {"op": "delete", "target": self.workspace.pk, "withChildren": True}

        with self.assertRaises(notes.Refusal):
            notes.call(self.owner, [{**delete, "withChildren": False}])
        with self.assertRaises(notes.Refusal) as refusal:
            notes.call(self.owner, [delete, {"op": "setText", "target": self.workspace.pk}])
        self.assertEqual(refusal.exception.index, 1)
        preview = notes.call(self.owner, [delete], dry_run=True)
        self.assertTrue(Workspace.objects.filter(pk=self.workspace.pk).exists())

        result = notes.call(self.owner, [delete])

        self.assertEqual(preview["changes"], result["changes"])
        self.assertEqual(result["results"], [{"removedIds": ["k3x9"]}])
        self.assertEqual(result["changes"], [{"ref": self.workspace.pk, "change": "deleted"}])
        self.assertFalse(Workspace.objects.filter(pk=self.workspace.pk).exists())
        self.assertFalse(Blob.objects.exists())
