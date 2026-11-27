from pathlib import Path

import yaml
from accounts.models import User
from django.test import SimpleTestCase, TestCase

from . import models, outline_tree, text_format

REPO = Path(__file__).resolve().parents[2]


def tree_of(text):
    return text_format.to_json(text_format.read(text))


def notes_of(tree):
    return list(outline_tree.in_order(tree["children"]))


class MatchTests(SimpleTestCase):
    """Matching a read tree's notes to a base tree's, as Apply matches them."""

    def test_the_shared_cases(self):
        # The same cases run on Apply (src/headless/outline-tree/outline-tree.spec.ts).
        cases = yaml.safe_load((REPO / "tests/fixtures/outline-tree/match.yaml").read_text("utf8"))
        for case in cases:
            with self.subTest(case["name"]):
                base = tree_of(case["base"])
                for index, note in enumerate(notes_of(base)):
                    note["cacheId"] = note.get("id") or f"n{index}"
                ids = [note["cacheId"] for note in notes_of(base)]

                matched = outline_tree.match(tree_of(case["read"]), base)

                taken = [note["cacheId"] for note in notes_of(matched)]
                self.assertEqual(
                    [ids.index(cache_id) if cache_id in ids else None for cache_id in taken],
                    case["takes"],
                )
                self.assertEqual(len(set(taken)), len(taken))

    def test_a_cache_id_two_base_notes_hold_stays_with_the_first(self):
        base = tree_of("- a\n- b\n")
        for note in base["children"]:
            note["cacheId"] = "same"

        matched = outline_tree.match(tree_of("- a\n- b\n"), base)

        first, second = (note["cacheId"] for note in matched["children"])
        self.assertEqual(first, "same")
        self.assertNotIn(second, (None, "same"))

    def test_a_tree_without_a_base_gets_new_cache_ids(self):
        matched = outline_tree.match(tree_of("- a\n    > body\n"))

        self.assertTrue(all(note["cacheId"] for note in notes_of(matched)))


class CurrentTreeTests(SimpleTestCase):
    def test_a_row_tree_that_reads_as_the_file_is_the_current_tree(self):
        tree = outline_tree.match(tree_of("- a\n"))

        self.assertIs(outline_tree.current(tree, tree_of("- a\n")), tree)

    def test_a_row_tree_that_doesnt_read_as_the_file_gives_its_cache_ids_to_the_files_reading(self):
        tree = outline_tree.match(tree_of("- a\n- b\n"))

        current = outline_tree.current(tree, tree_of("- a\n- c\n"))

        self.assertEqual(outline_tree.stripped(current), tree_of("- a\n- c\n"))
        self.assertEqual(current["children"][0]["cacheId"], tree["children"][0]["cacheId"])
        self.assertNotEqual(current["children"][1]["cacheId"], tree["children"][1]["cacheId"])


class KeptTreeTests(TestCase):
    def test_a_workspace_deleted_meanwhile_keeps_no_tree(self):
        workspace = models.Workspace.objects.create(
            name="Gone", owner=User.objects.create_user("owner@example.test")
        )
        models.Workspace.objects.filter(pk=workspace.pk).delete()

        with self.assertRaises(models.Workspace.DoesNotExist):
            outline_tree.kept(workspace, tree_of("- a\n"))

        self.assertFalse(models.DocumentState.objects.exists())
