from accounts.models import User
from django.test import TestCase

from . import notes, store
from .models import Workspace

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
                "parent": {"path": "notes"},
                "kind": "document",
                "text": "Plan",
                "content": "# Plan\n",
            }
        ],
        after={"notes/a.md": "a\n", "notes/Plan.md": "# Plan\n"},
    ),
    "insert a document carrying an ID": dict(
        ops=[{"op": "insert", "kind": "document", "text": "Plan", "content": DOC}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "insert where a name differs only by case": dict(
        before={"Plan.md": "a\n"},
        ops=[{"op": "insert", "kind": "document", "text": "plan"}],
        refused=("FAILED_PRECONDITION", 0),
    ),
    "insert a file named like a document": dict(
        ops=[{"op": "insert", "kind": "file", "text": "a.md"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "move a document keeps its content and IDs": dict(
        before={"plan.md": DOC, "archive/old.md": "old\n"},
        read=["plan.md"],
        ops=[{"op": "move", "target": {"path": "plan.md"}, "parent": {"path": "archive"}}],
        after={"archive/plan.md": DOC, "archive/old.md": "old\n"},
    ),
    "move a folder into itself": dict(
        before={"a/x.md": "x\n"},
        read=["a/"],
        ops=[{"op": "move", "target": {"path": "a"}, "parent": {"path": "a"}}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "rename a folder renames everything under it": dict(
        before={"a/x.md": "x\n", "a/b/y.png": "y", "ab.md": "beside\n"},
        read=["a/"],
        ops=[{"op": "setText", "target": {"path": "a"}, "text": "c"}],
        after={"c/x.md": "x\n", "c/b/y.png": "y", "ab.md": "beside\n"},
    ),
    "rename a document by replacement": dict(
        before={"Plan draft.md": "a\n"},
        read=["Plan draft.md"],
        ops=[
            {
                "op": "setText",
                "target": {"path": "Plan draft.md"},
                "replacements": [{"old": " draft", "new": ""}],
            }
        ],
        after={"Plan.md": "a\n"},
    ),
    "rename a file into a document": dict(
        before={"a.txt": "a\n"},
        read=["a.txt"],
        ops=[{"op": "setText", "target": {"path": "a.txt"}, "text": "a.md"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "set text to the same text": dict(
        before={"a.md": "a\n"},
        read=["a.md"],
        ops=[{"op": "setText", "target": {"path": "a.md"}, "text": "a"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "delete a folder needs withChildren": dict(
        before={"a/x.md": "x\n"},
        read=["a/"],
        ops=[{"op": "delete", "target": {"path": "a"}}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "delete a folder with its children": dict(
        before={"a/x.md": DOC, "a/y.md": OTHER, "b.md": "b\n"},
        read=["a/"],
        ops=[{"op": "delete", "target": {"path": "a"}, "withChildren": True}],
        after={"b.md": "b\n"},
        results=[{"removedIds": ["k3x9", "p7q2"]}],
    ),
    "delete a document with content needs withChildren": dict(
        before={"a.md": "- a\n"},
        read=["a.md"],
        ops=[{"op": "delete", "target": {"path": "a.md"}}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "delete a document holding only its ID": dict(
        before={"a.md": "- id:: k3x9\n", "b.txt": "b\n"},
        read=["a.md"],
        ops=[{"op": "delete", "target": {"path": "a.md"}}],
        after={"b.txt": "b\n"},
        results=[{"removedIds": ["k3x9"]}],
    ),
    "set content by exact replacement": dict(
        before={"a.md": DOC},
        read=["a.md"],
        ops=[
            {
                "op": "setContent",
                "target": {"path": "a.md"},
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
                "target": {"path": "a.md"},
                "replacements": [{"old": "- x", "new": "- y"}],
            }
        ],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "set content removing an ID": dict(
        before={"a.md": DOC},
        read=["a.md"],
        ops=[{"op": "setContent", "target": {"path": "a.md"}, "content": "# Plan\n"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "a file changed since it was read": dict(
        before={"a.md": "a\n"},
        read=["a.md"],
        changed_after_read={"a.md": "theirs\n"},
        ops=[{"op": "setContent", "target": {"path": "a.md"}, "content": "mine\n"}],
        refused=("FAILED_PRECONDITION", 0),
    ),
    "a file changed under a folder since it was read": dict(
        before={"a/x.md": "x\n"},
        read=["a/"],
        changed_after_read={"a/x.md": "theirs\n"},
        ops=[{"op": "delete", "target": {"path": "a"}, "withChildren": True}],
        refused=("FAILED_PRECONDITION", 0),
    ),
    "the workspace's version covers every file": dict(
        before={"a/x.md": "- x\n", "b.txt": "b\n"},
        read=[""],
        ops=[{"op": "delete", "target": {"path": "a"}, "withChildren": True}],
        after={"b.txt": "b\n"},
    ),
    "a folder change needs its listing version, not only its files' versions": dict(
        before={"a/x.md": "x\n"},
        read=["a/x.md"],
        ops=[{"op": "setText", "target": {"path": "a"}, "text": "c"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "the deepest folder read vouches for its files": dict(
        before={"a/x.md": "- x\n", "b.md": "b\n"},
        read=["", "a/"],
        changed_after_read={"b.md": "theirs\n"},
        ops=[{"op": "delete", "target": {"path": "a"}, "withChildren": True}],
        after={"b.md": "theirs\n"},
    ),
    "set content without content or replacements": dict(
        before={"a.txt": "a\n"},
        read=["a.txt"],
        ops=[{"op": "setContent", "target": {"path": "a.txt"}}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "set content with text that isn't valid Unicode": dict(
        before={"a.txt": "a\n"},
        read=["a.txt"],
        ops=[{"op": "setContent", "target": {"path": "a.txt"}, "content": "\ud800"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "set content removing an ID on a CRLF line": dict(
        before={"a.md": "- a\r\n  - id:: k3x9\r\n"},
        read=["a.md"],
        ops=[{"op": "setContent", "target": {"path": "a.md"}, "content": "- a\r\n"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "a change without the version read": dict(
        before={"a.md": "a\n"},
        ops=[{"op": "setContent", "target": {"path": "a.md"}, "content": "b\n"}],
        refused=("INVALID_ARGUMENT", 0),
    ),
    "later operations name notes created earlier": dict(
        before={"archive/old.md": "old\n"},
        ops=[
            {"op": "insert", "kind": "document", "text": "Plan", "content": "- a\n"},
            {"op": "setContent", "target": {"path": "Plan.md"}, "content": "- b\n"},
            {"op": "move", "target": {"path": "Plan.md"}, "parent": {"path": "archive"}},
        ],
        after={"archive/old.md": "old\n", "archive/Plan.md": "- b\n"},
    ),
    "a refused operation undoes the whole call": dict(
        before={"a.md": "a\n"},
        read=["a.md"],
        ops=[
            {"op": "insert", "kind": "document", "text": "b"},
            {"op": "delete", "target": {"path": "a.md"}, "withChildren": True},
            {"op": "delete", "target": {"path": "missing.md"}},
        ],
        refused=("NOT_FOUND", 2),
    ),
}


class NoteOperationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@example.test", "Owner-password-123")

    def setUp(self):
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

    def files(self):
        return {
            path: store.read(self.workspace, path).content.decode()
            for path in store.list_paths(self.workspace).files
        }

    def versions(self, reads):
        expected = {"files": {}, "folders": {}}
        for read in reads:
            if read.endswith("/") or read == "":
                folder = read.rstrip("/")
                expected["folders"][folder] = store.list_paths(self.workspace, folder).version
            else:
                expected["files"][read] = store.read(self.workspace, read).blob_hash
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
                        notes.change(self.workspace, self.owner, case["ops"], expected)
                    self.assertEqual(
                        (refusal.exception.code, refusal.exception.index), case["refused"]
                    )
                    self.assertEqual(self.files(), before)
                    continue
                result = notes.change(self.workspace, self.owner, case["ops"], expected)
                self.assertEqual(self.files(), case["after"])
                if "results" in case:
                    self.assertEqual(result["results"], case["results"])

    def test_stale_refusal_returns_the_current_version(self):
        self.write({"a.md": "a\n"})
        expected = self.versions(["a.md"])
        self.write({"a.md": "theirs\n"})

        with self.assertRaises(notes.Refusal) as refusal:
            notes.change(
                self.workspace,
                self.owner,
                [{"op": "delete", "target": {"path": "a.md"}, "withChildren": True}],
                expected,
            )

        current = store.read(self.workspace, "a.md").blob_hash
        self.assertEqual(refusal.exception.versions, {"files": {"a.md": current}})

    def test_success_returns_results_references_and_new_versions(self):
        result = notes.change(
            self.workspace,
            self.owner,
            [{"op": "insert", "kind": "document", "text": "Plan", "content": "- a\n"}],
        )

        version = store.read(self.workspace, "Plan.md").blob_hash
        ref = {"workspace": self.workspace.pk, "path": "Plan.md"}
        self.assertEqual(result["results"], [{"ref": ref, "kind": "document"}])
        self.assertEqual(result["changes"], [{"ref": ref, "change": "added", "version": version}])
        self.assertEqual(result["revision"], self.workspace.head_id)

    def test_dry_run_describes_the_change_and_changes_nothing(self):
        self.write({"a.md": "- a\n"})
        head = self.workspace.head_id

        result = notes.change(
            self.workspace,
            self.owner,
            [{"op": "setContent", "target": {"path": "a.md"}, "content": "- b\n"}],
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

        result = notes.change(
            self.workspace,
            self.owner,
            [{"op": "move", "target": {"path": "a.md"}, "parent": {"path": ""}}],
            self.versions(["a.md"]),
        )

        self.assertEqual(result["changes"], [])
        self.assertEqual(Workspace.objects.get(pk=self.workspace.pk).head_id, head)

    def test_renaming_the_workspace_changes_no_files(self):
        rename = [{"op": "setText", "target": {"path": ""}, "text": "Work"}]
        ref = {"workspace": self.workspace.pk, "path": ""}
        renamed = [{"ref": ref, "change": "renamed", "text": "Work"}]

        preview = notes.change(self.workspace, self.owner, rename, dry_run=True)
        self.assertEqual(preview["changes"], renamed)
        self.assertEqual(Workspace.objects.get(pk=self.workspace.pk).name, "Personal")

        result = notes.change(self.workspace, self.owner, rename)
        self.assertEqual(result["changes"], renamed)
        self.assertEqual(Workspace.objects.get(pk=self.workspace.pk).name, "Work")
        self.assertIsNone(self.workspace.head_id)

    def test_a_taken_path_refusal_returns_what_occupies_it(self):
        self.write({"Plan.md": "- a\n", "notes/x.md": "x\n"})

        for text, versions in (
            ("plan", {"files": {"Plan.md": store.read(self.workspace, "Plan.md").blob_hash}}),
            ("notes", {"folders": {"notes": store.list_paths(self.workspace, "notes").version}}),
        ):
            with self.subTest(text=text), self.assertRaises(notes.Refusal) as refusal:
                kind = "document" if text == "plan" else "file"
                notes.change(
                    self.workspace,
                    self.owner,
                    [{"op": "insert", "kind": kind, "text": text}],
                )
            self.assertEqual(refusal.exception.versions, versions)

    def test_a_move_past_the_path_limit_blames_the_parent(self):
        deep = "/".join(["d" * 40] * 4)
        self.write({f"{deep}/x.md": "x\n", "long/" + "n" * 60 + ".md": "n\n"})

        with self.assertRaises(notes.Refusal) as refusal:
            notes.change(
                self.workspace,
                self.owner,
                [{"op": "move", "target": {"path": "long"}, "parent": {"path": deep}}],
                {"folders": {"long": store.list_paths(self.workspace, "long").version}},
            )

        self.assertTrue(str(refusal.exception).startswith("parent: "), refusal.exception)

    def test_read_lists_children_by_name_with_versions(self):
        self.write({"b.md": "- b\n", "a/x.png": "x", "c.txt": "", "empty.md": ""})

        node = notes.read(self.owner, {"workspace": self.workspace.pk}, depth=1)

        self.assertEqual(node["kind"], "workspace")
        self.assertEqual(node["text"], "Personal")
        self.assertEqual(node["version"], store.list_paths(self.workspace).version)
        self.assertEqual(
            [
                (child["ref"]["path"], child["kind"], child["text"], child.get("hasChildren"))
                for child in node["children"]
            ],
            [
                ("a", "folder", "a", True),
                ("b.md", "document", "b", None),
                ("c.txt", "file", "c.txt", False),
                ("empty.md", "document", "empty", None),
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
        return {"workspace": self.workspace.pk, "path": path}

    def test_the_account_root_lists_workspaces_and_gives_a_personal_one(self):
        user = User.objects.create_user("new@example.test", "New-password-123")

        first = notes.read(user, depth=1)
        second = notes.read(user, depth=1)

        self.assertEqual(first, second)
        self.assertEqual((first["kind"], first["text"]), ("account", "new@example.test"))
        self.assertEqual(first["operations"], ["read", "insert"])
        self.assertEqual([child["text"] for child in first["children"]], ["Personal"])

    def test_inserting_under_the_account_root_creates_a_workspace(self):
        insert = {"op": "insert", "kind": "workspace", "text": "Team"}

        preview = notes.call(self.owner, [insert], dry_run=True)
        self.assertEqual(Workspace.objects.filter(owner=self.owner).count(), 1)

        result = notes.call(self.owner, [insert])
        [created] = Workspace.objects.filter(owner=self.owner, name="Team")
        self.assertEqual(
            result["results"], [{"ref": {"workspace": created.pk, "path": ""}, "kind": "workspace"}]
        )
        self.assertTrue(preview["dryRun"])
        self.assertEqual(
            [child["text"] for child in notes.read(self.owner)["children"]], ["Personal", "Team"]
        )

    def test_the_account_root_holds_only_workspaces(self):
        for operation, code in (
            ({"op": "insert", "kind": "document", "text": "Plan"}, "INVALID_ARGUMENT"),
            ({"op": "delete", "target": {}}, "INVALID_ARGUMENT"),
        ):
            with self.subTest(operation=operation), self.assertRaises(notes.Refusal) as refusal:
                notes.call(self.owner, [operation])
            self.assertEqual((refusal.exception.code, refusal.exception.index), (code, 0))

    def test_a_call_stays_within_one_workspace(self):
        other = Workspace.objects.create(name="Other", owner=self.owner)
        self.write({"a.md": "a\n"})

        for operations in (
            [{"op": "move", "target": self.ref("a.md"), "parent": {"workspace": other.pk}}],
            [
                {"op": "insert", "parent": self.ref(), "kind": "file", "text": "x"},
                {"op": "insert", "parent": {"workspace": other.pk}, "kind": "file", "text": "y"},
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
