from pathlib import Path

import yaml
from accounts.models import User
from django.test import TestCase
from notes import service as notes

from . import store
from .models import Workspace

CASES = Path(__file__).resolve().parents[2] / "tests/fixtures/note-operations"
NEW = "<new>"


class OperationCaseTests(TestCase):
    """The shared operation cases, run on the workspace source's note operations."""

    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@example.test")

    def refs(self, workspace):
        """Each note's reference by its text, from a read, with the document as README.md."""
        document = notes.read(self.owner, f"{workspace.pk}/README.md", depth=100)
        refs = {"README.md": [document["ref"]]}
        pending = list(document["children"])
        while pending:
            note = pending.pop()
            refs.setdefault(note["text"], []).append(note["ref"])
            pending.extend(note["children"])
        return refs, document["version"]

    def seeded(self, text):
        """A workspace whose document holds `text`, its notes' references by text, and its version."""
        workspace = Workspace.objects.create(name="Cases", owner=self.owner)
        store.commit(workspace, self.owner, "", {"README.md": (None, text.encode())})
        return workspace, *self.refs(workspace)

    def run_case(self, case):
        workspace, refs, version = self.seeded(case["before"])
        operations = []
        for operation in case["operations"]:
            [ref] = refs[operation["target"]]
            operations.append({**operation, "target": ref})
        expected = {f"{workspace.pk}/README.md": version}

        if "refused" in case:
            with self.assertRaises(notes.Refusal) as refusal:
                notes.call(self.owner, operations, expected)
            self.assertEqual(refusal.exception.code, case["refused"])
            self.assertEqual(store.read(workspace, "README.md").content.decode(), case["before"])
            return
        result = notes.call(self.owner, operations, expected)
        after = case["after"]
        if NEW in after:
            [new_id] = {r["id"] for r in result["results"] if "id" in r}
            after = after.replace(NEW, new_id)
        self.assertEqual(store.read(workspace, "README.md").content.decode(), after)
        for got, wanted in zip(result["results"], case.get("results", []), strict=False):
            self.assertEqual({key: got[key] for key in wanted}, wanted)

    def test_cases(self):
        for path in sorted(CASES.glob("*.yaml")):
            for case in yaml.safe_load(path.read_text()):
                with self.subTest(f"{path.stem}: {case['name']}"):
                    self.run_case(case)

    def test_a_later_operation_resolves_ids_in_the_text_an_earlier_one_wrote(self):
        workspace, refs, version = self.seeded("- a\n    - id:: k3x9\n- b\n    - id:: k3x9\n")

        notes.call(
            self.owner,
            [
                {"op": "ensureId", "target": refs["- b"][0]},
                {"op": "setText", "target": f"{workspace.pk}_k3x9", "text": "- a, edited"},
            ],
            {f"{workspace.pk}/README.md": version},
        )

        text = store.read(workspace, "README.md").content.decode()
        self.assertTrue(text.startswith("- a, edited\n    - id:: k3x9\n- b\n"))

    def test_ensure_id_by_a_stale_reference_is_refused_even_when_nothing_would_change(self):
        workspace, refs, version = self.seeded("- a\n- b\n")
        changed = b"- x\n    - id:: k3x9\n- a\n- b\n"
        store.commit(workspace, self.owner, "", {"README.md": (version, changed)})

        with self.assertRaises(notes.Refusal) as refusal:
            notes.call(
                self.owner,
                [{"op": "ensureId", "target": refs["- a"][0]}],
                {f"{workspace.pk}/README.md": version},
            )

        self.assertEqual(refusal.exception.code, "FAILED_PRECONDITION")
