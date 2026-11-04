from accounts.models import User
from django.db.models import RestrictedError
from django.test import TestCase

from . import store
from .models import FILE_MAX_BYTES, Blob, Revision, Workspace


class WorkspaceStoreTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@example.test", "Owner-password-123")

    def setUp(self):
        self.workspace = Workspace.objects.create(name="Personal", owner=self.owner)

    def commit(self, changes, expected=None, message=""):
        """Commit, expecting each changed file as it currently is unless told otherwise."""
        if expected is None:
            expected = {path: store.read(self.workspace, path).blob_hash for path in changes}
        return store.commit(
            self.workspace,
            self.owner,
            message,
            {path: (expected[path], content) for path, content in changes.items()},
        )

    def content(self, path):
        return store.read(self.workspace, path).content

    def test_content_round_trips_byte_exact(self):
        files = {
            "a.md": b"- no final newline",
            "b.md": b"- trailing spaces   \n\n\n",
            "c.md": "- [x] done\r\n- café 😀\n".encode(),
            "image.png": b"\x89PNG\r\n\x1a\n\x00\xff\xfe binary",
            "empty.txt": b"",
        }
        self.commit(files)

        for path, content in files.items():
            with self.subTest(path=path):
                self.assertEqual(self.content(path), content)
        self.assertEqual(store.list_paths(self.workspace).paths, sorted(files))

    def test_identical_content_is_stored_once(self):
        self.commit({"a.md": b"same\n", "b.md": b"same\n"})
        self.commit({"c.md": b"same\n"})

        self.assertEqual(Blob.objects.count(), 1)

    def test_files_over_the_size_limit_are_rejected(self):
        self.commit({"limit.bin": b"x" * FILE_MAX_BYTES})

        with self.assertRaises(store.InvalidContent):
            self.commit({"over.bin": b"x" * (FILE_MAX_BYTES + 1)})

    def test_changed_file_is_refused_and_nothing_written(self):
        self.commit({"a.md": b"one\n"})
        read = store.read(self.workspace, "a.md")
        self.commit({"a.md": b"two\n"})
        revisions = self.workspace.revisions.count()

        with self.assertRaises(store.StaleFile):
            self.commit(
                {"a.md": b"conflicting\n", "b.md": b"new\n"},
                expected={"a.md": read.blob_hash, "b.md": None},
            )

        self.assertEqual(self.content("a.md"), b"two\n")
        self.assertIsNone(self.content("b.md"))
        self.assertEqual(self.workspace.revisions.count(), revisions)

    def test_file_created_since_read_is_refused(self):
        missing = store.read(self.workspace, "a.md")
        self.commit({"a.md": b"theirs\n"})

        with self.assertRaises(store.StaleFile):
            self.commit({"a.md": b"mine\n"}, expected={"a.md": missing.blob_hash})

    def test_commits_to_other_files_dont_conflict(self):
        self.commit({"a.md": b"one\n"})
        read = store.read(self.workspace, "a.md")
        other = self.commit({"b.md": b"other\n"})

        mine = self.commit({"a.md": b"mine\n"}, expected={"a.md": read.blob_hash})

        self.assertEqual(mine.parent, other)
        self.assertEqual(store.files_at(mine), {"a.md": b"mine\n", "b.md": b"other\n"})

    def test_file_added_or_changed_under_a_listed_folder_is_refused(self):
        self.commit({"notes/a.md": b"a\n", "notesbook.md": b"beside, not under\n"})
        listed = store.list_paths(self.workspace, "notes")
        self.commit({"notesbook.md": b"changed\n"})
        self.assertEqual(store.list_paths(self.workspace, "notes"), listed)
        self.assertEqual(listed.paths, ["notes/a.md"])

        for change in ({"notes/b.md": b"added\n"}, {"notes/a.md": b"changed\n"}):
            with self.subTest(change=change):
                self.commit(change)
                with self.assertRaises(store.StaleFile):
                    store.commit(
                        self.workspace,
                        self.owner,
                        "",
                        {"notes/c.md": (None, b"mine\n")},
                        folders={"notes": listed.version},
                    )
                self.assertIsNone(self.content("notes/c.md"))
                listed = store.list_paths(self.workspace, "notes")

    def test_delete_keeps_history(self):
        first = self.commit({"a.md": b"kept in history\n"})
        second = self.commit({"a.md": None})

        self.assertIsNone(self.content("a.md"))
        self.assertEqual(store.files_at(first), {"a.md": b"kept in history\n"})
        self.assertEqual(store.files_at(second), {})

    def test_every_revision_rebuilds_from_history(self):
        steps = [
            {"a.md": b"1\n", "b.md": b"1\n"},
            {"a.md": b"2\n"},
            {"b.md": None, "dir/c.md": b"1\n"},
            {"a.md": None, "b.md": b"back\n"},
        ]
        expected, revisions = {}, []
        for changes in steps:
            head = self.commit(changes)
            for path, content in changes.items():
                if content is None:
                    expected.pop(path)
                else:
                    expected[path] = content
            revisions.append((head, dict(expected)))

        for revision, files in revisions:
            with self.subTest(revision=revision.pk):
                self.assertEqual(store.files_at(revision), files)
        self.assertEqual(
            {path: self.content(path) for path in store.list_paths(self.workspace).paths}, expected
        )

    def test_invalid_paths_are_rejected(self):
        for path in (
            "",
            "/a.md",
            "a/../b.md",
            "./a.md",
            "a//b.md",
            "a/",
            "a\\b.md",
            "a\nb.md",
            "a:b.md",
            "trailing.",
            "dir /a.md",
            "CON.md",
            "docs/lpt1.txt",
            "COM¹.md",
            "lpt0.md",
            "a\x85b.md",
            "a\ud800b.md",
            "x" * 256 + ".md",
            "dir/" + "x" * 197,
            ".git/config",
            ".GIT/hooks/post-checkout",
            ".g\u200cit/config",
            "git~1/config",
            "CONIN$.md",
            "NUL .txt",
        ):
            with self.subTest(path=path), self.assertRaises(store.InvalidPath):
                self.commit({path: b"x\n"})

    def test_paths_a_case_insensitive_filesystem_cant_hold_are_rejected(self):
        with self.assertRaises(store.InvalidPath):
            self.commit({"Notes.md": b"a\n", "notes.md": b"b\n"})

        self.commit({"Notes.md": b"a\n", "dir/x.md": b"x\n"})
        for changes in (
            {"NOTES.md": b"b\n"},
            {"notes.md/y.md": b"y\n"},
            {"DIR": b"file\n"},
            {"Dir/y.md": b"y\n"},
        ):
            with self.subTest(changes=changes), self.assertRaises(store.InvalidPath):
                self.commit(changes)

        renamed = self.commit({"Notes.md": None, "notes.md": b"a\n"})
        self.assertEqual(store.list_paths(self.workspace).paths, ["dir/x.md", "notes.md"])
        self.assertEqual(store.files_at(renamed), {"dir/x.md": b"x\n", "notes.md": b"a\n"})

    def test_longest_portable_path_is_accepted(self):
        self.commit({"dir/" + "x" * 196: b"x\n"})

    def test_unicode_paths_are_normalized(self):
        decomposed = "café.md"
        self.commit({decomposed: b"x\n"})

        self.assertEqual(store.list_paths(self.workspace).paths, ["café.md"])
        self.assertEqual(self.content(decomposed), b"x\n")

    def test_history_survives_until_its_workspace_is_deleted(self):
        first = self.commit({"a.md": b"one\n"})

        with self.assertRaises(RestrictedError):
            first.delete()

        self.workspace.delete()
        self.assertFalse(Revision.objects.exists())

    def test_deleting_a_workspace_deletes_content_no_other_workspace_holds(self):
        other = Workspace.objects.create(name="Other", owner=self.owner)
        store.commit(other, self.owner, "", {"shared.md": (None, b"shared\n")})
        self.commit({"shared.md": b"shared\n", "own.md": b"own\n"})
        self.commit({"own.md": b"edited\n"})

        self.workspace.delete()

        self.assertEqual(
            {bytes(c) for c in Blob.objects.values_list("content", flat=True)}, {b"shared\n"}
        )

    def test_deleting_an_account_deletes_its_workspaces_content(self):
        self.commit({"a.md": b"private\n"})

        self.owner.delete()

        self.assertFalse(Blob.objects.exists())

    def test_unchanged_or_invalid_changes_are_rejected(self):
        self.commit({"a.md": b"same\n"})

        with self.assertRaises(store.NoChanges):
            self.commit({"a.md": b"same\n"})
        with self.assertRaises(store.InvalidPath):
            self.commit({"missing.md": None})
        with self.assertRaises(store.InvalidContent):
            self.commit({"b.md": "text, not bytes\n"})
