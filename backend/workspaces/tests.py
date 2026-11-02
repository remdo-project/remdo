from accounts.models import User
from django.db.models import RestrictedError
from django.test import TestCase

from . import store
from .models import Blob, Revision, Workspace


class WorkspaceStoreTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@example.test", "Owner-password-123")

    def setUp(self):
        self.workspace = Workspace.objects.create(name="Personal", owner=self.owner)

    def commit(self, changes, base=None, message=""):
        return store.commit(self.workspace, self.owner, message, changes, base)

    def test_text_round_trips_byte_exact(self):
        texts = {
            "a.md": "- no final newline",
            "b.md": "- trailing spaces   \n\n\n",
            "c.md": "- [x] done\r\n- café 😀\n",
        }
        self.commit(texts)

        for path, text in texts.items():
            with self.subTest(path=path):
                self.assertEqual(store.read(self.workspace, path).text, text)
        self.assertEqual(store.list_paths(self.workspace), sorted(texts))

    def test_identical_content_is_stored_once(self):
        first = self.commit({"a.md": "same\n", "b.md": "same\n"})
        self.commit({"c.md": "same\n"}, base=first)

        self.assertEqual(Blob.objects.count(), 1)

    def test_stale_base_writes_nothing(self):
        self.commit({"a.md": "one\n"})
        read = store.read(self.workspace, "a.md")
        self.commit({"a.md": "two\n"}, base=read.base)
        revisions = self.workspace.revisions.count()

        with self.assertRaises(store.StaleBase):
            self.commit({"a.md": "conflicting\n", "b.md": "new\n"}, base=read.base)

        self.assertEqual(store.read(self.workspace, "a.md").text, "two\n")
        self.assertIsNone(store.read(self.workspace, "b.md").text)
        self.assertEqual(self.workspace.revisions.count(), revisions)

    def test_read_returns_the_base_for_its_commit(self):
        missing = store.read(self.workspace, "a.md")
        created = self.commit({"a.md": "one\n"}, base=missing.base)

        read = store.read(self.workspace, "a.md")
        self.assertEqual((read.base, read.text), (created.pk, "one\n"))

    def test_delete_keeps_history(self):
        first = self.commit({"a.md": "kept in history\n"})
        second = self.commit({"a.md": None}, base=first)

        self.assertIsNone(store.read(self.workspace, "a.md").text)
        self.assertEqual(store.files_at(first), {"a.md": "kept in history\n"})
        self.assertEqual(store.files_at(second), {})

    def test_every_revision_rebuilds_from_history(self):
        steps = [
            {"a.md": "1\n", "b.md": "1\n"},
            {"a.md": "2\n"},
            {"b.md": None, "dir/c.md": "1\n"},
            {"a.md": None, "b.md": "back\n"},
        ]
        expected, revisions, head = {}, [], None
        for changes in steps:
            head = self.commit(changes, base=head)
            for path, text in changes.items():
                if text is None:
                    expected.pop(path)
                else:
                    expected[path] = text
            revisions.append((head, dict(expected)))

        for revision, files in revisions:
            with self.subTest(revision=revision.pk):
                self.assertEqual(store.files_at(revision), files)
        self.assertEqual(
            {
                path: store.read(self.workspace, path).text
                for path in store.list_paths(self.workspace)
            },
            expected,
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
            "COM\u00b9.md",
            "x" * 256 + ".md",
        ):
            with self.subTest(path=path), self.assertRaises(store.InvalidPath):
                self.commit({path: "x\n"})

    def test_paths_a_case_insensitive_filesystem_cant_hold_are_rejected(self):
        with self.assertRaises(store.InvalidPath):
            self.commit({"Notes.md": "a\n", "notes.md": "b\n"})

        first = self.commit({"Notes.md": "a\n", "dir/x.md": "x\n"})
        for changes in ({"NOTES.md": "b\n"}, {"notes.md/y.md": "y\n"}, {"DIR": "file\n"}):
            with self.subTest(changes=changes), self.assertRaises(store.InvalidPath):
                self.commit(changes, base=first)

        renamed = self.commit({"Notes.md": None, "notes.md": "a\n"}, base=first)
        self.assertEqual(store.list_paths(self.workspace), ["dir/x.md", "notes.md"])
        self.assertEqual(store.files_at(renamed), {"dir/x.md": "x\n", "notes.md": "a\n"})

    def test_unicode_paths_are_normalized(self):
        decomposed = "cafe\u0301.md"
        self.commit({decomposed: "x\n"})

        self.assertEqual(store.list_paths(self.workspace), ["caf\u00e9.md"])
        self.assertEqual(store.read(self.workspace, decomposed).text, "x\n")

    def test_history_survives_until_its_workspace_is_deleted(self):
        first = self.commit({"a.md": "one\n"})

        with self.assertRaises(RestrictedError):
            first.delete()

        self.workspace.delete()
        self.assertFalse(Revision.objects.exists())

    def test_unchanged_or_invalid_changes_are_rejected(self):
        first = self.commit({"a.md": "same\n"})

        with self.assertRaises(store.NoChanges):
            self.commit({"a.md": "same\n"}, base=first)
        with self.assertRaises(store.InvalidPath):
            self.commit({"missing.md": None}, base=first)
        with self.assertRaises(store.InvalidText):
            self.commit({"b.md": "nul\x00"}, base=first)
