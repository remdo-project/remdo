from urllib.parse import quote

from accounts.models import User
from django.contrib.auth.models import Permission
from django.test import TestCase
from workspaces import store
from workspaces.models import Workspace


class NotesApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("owner@example.test", "Owner-password-123")
        cls.user.user_permissions.add(Permission.objects.get(codename="use_workspaces"))

    def setUp(self):
        self.client.force_login(self.user)

    def read(self, ref, **query):
        return self.client.get(f"/api/notes/{quote(ref, safe='')}", query)

    def call(self, operations, expected=None):
        return self.client.post(
            "/api/notes",
            {"operations": operations, "expected": expected or {}},
            content_type="application/json",
        )

    def test_only_users_with_the_permission_reach_notes(self):
        other = User.objects.create_user("other@example.test", "Other-password-123")
        self.client.force_login(other)

        self.assertEqual(self.read("me").status_code, 403)
        self.assertEqual(
            self.call([{"op": "insert", "kind": "workspace", "text": "x"}]).status_code, 403
        )
        self.client.logout()
        self.assertEqual(self.read("me").status_code, 403)

    def test_the_app_creates_reads_saves_and_deletes_a_workspace(self):
        created = self.call([{"op": "insert", "parent": "me", "kind": "workspace", "text": "Trip"}])
        self.assertEqual(created.status_code, 200, created.json())
        [result] = created.json()["results"]
        readme = f"{result['ref']}/README.md"

        root = self.read("me", depth=2).json()
        [workspace] = root["children"]
        self.assertEqual(workspace["text"], "Trip")
        [document] = workspace["children"]
        self.assertEqual((document["ref"], document["version"]), (readme, None))

        saved = self.call(
            [{"op": "setContent", "target": readme, "content": "- a\n"}], {readme: None}
        )
        self.assertEqual(saved.status_code, 200, saved.json())
        self.assertEqual(self.read(readme, content="true").json()["content"], "- a\n")

        deleted = self.call([{"op": "delete", "target": result["ref"], "withChildren": True}])
        self.assertEqual(deleted.status_code, 200, deleted.json())
        self.assertFalse(Workspace.objects.exists())

    def test_refusals_carry_their_code_operation_and_current_versions(self):
        workspace = Workspace.objects.create(name="Trip", owner=self.user)
        store.commit(workspace, self.user, "", {"README.md": (None, b"- theirs\n")})
        readme = f"{workspace.pk}/README.md"

        stale = self.call(
            [{"op": "setContent", "target": readme, "content": "- mine\n"}], {readme: None}
        )
        missing = self.read(f"{workspace.pk}/missing.md")
        malformed = self.call([{"op": "setContent"}])

        current = store.read(workspace, "README.md").blob_hash
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(
            {key: stale.json()[key] for key in ("code", "index", "versions")},
            {"code": "FAILED_PRECONDITION", "index": 0, "versions": {readme: current}},
        )
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(malformed.status_code, 400)
