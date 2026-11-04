import json

from accounts.models import User
from asgiref.sync import sync_to_async
from django.contrib.auth.models import Permission
from django.test import TransactionTestCase
from documents.test_mcp import McpClient

from . import store
from .models import Workspace

WORKSPACE_TOOLS = {"list_workspaces", "read_note", "change_workspace"}


class WorkspaceMcpTests(McpClient, TransactionTestCase):
    def allow_workspaces(self):
        self.user.user_permissions.add(Permission.objects.get(codename="use_workspaces"))

    async def tool_names(self):
        response = await self.request({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        return {tool["name"] for tool in response.json()["result"]["tools"]}

    async def call_json(self, name, arguments):
        result = await self.call(name, arguments)
        self.assertFalse(result.get("isError"), result)
        return json.loads(result["content"][0]["text"])

    async def test_only_users_with_the_permission_see_workspace_tools(self):
        names = await self.tool_names()
        self.assertFalse(names & WORKSPACE_TOOLS)
        refused = await self.call("list_workspaces", {})
        self.assertEqual(
            self.error_text(refused), "INVALID_ARGUMENT: Tool list_workspaces not found"
        )

        await sync_to_async(self.allow_workspaces)()

        self.assertEqual(await self.tool_names(), names | WORKSPACE_TOOLS)

    async def test_an_agent_creates_reads_and_changes_a_document(self):
        await sync_to_async(self.allow_workspaces)()
        [workspace] = await self.call_json("list_workspaces", {})
        self.assertEqual(workspace["name"], "Personal")
        workspace_id = workspace["workspace"]

        await self.call_json(
            "change_workspace",
            {
                "workspace": workspace_id,
                "operations": [
                    {"op": "insert", "kind": "document", "text": "Plan", "content": "- a\n"}
                ],
            },
        )
        document = await self.call_json(
            "read_note",
            {"workspace": workspace_id, "ref": {"path": "Plan.md"}, "content": True},
        )
        self.assertEqual((document["kind"], document["content"]), ("document", "- a\n"))

        edit = {
            "workspace": workspace_id,
            "operations": [{"op": "setContent", "target": {"path": "Plan.md"}, "content": "- b\n"}],
            "expected": {"files": {"Plan.md": document["version"]}},
        }
        await self.call_json("change_workspace", edit)
        stale = self.error_text(await self.call("change_workspace", edit))

        current = (await sync_to_async(self.read)(workspace_id, "Plan.md")).blob_hash
        self.assertEqual(
            stale,
            "FAILED_PRECONDITION: operations.0: 'Plan.md' changed since it was read. "
            f'Current versions: {{"files": {{"Plan.md": "{current}"}}}}',
        )

    async def test_other_users_workspaces_are_not_found(self):
        await sync_to_async(self.allow_workspaces)()
        other = await sync_to_async(User.objects.create_user)("other@example.test")
        workspace = await sync_to_async(Workspace.objects.create)(name="Theirs", owner=other)

        result = await self.call("read_note", {"workspace": workspace.pk})

        self.assertTrue(self.error_text(result).startswith("NOT_FOUND: "))

    def read(self, workspace_id, path):
        return store.read(Workspace.objects.get(pk=workspace_id), path)
