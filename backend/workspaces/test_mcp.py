import json
from unittest.mock import patch

from accounts.models import User
from asgiref.sync import sync_to_async
from django.contrib.auth.models import Permission
from django.db import DatabaseError
from django.test import TransactionTestCase, override_settings
from documents.test_mcp import McpClient

from . import store
from .models import Workspace

NOTE_TOOLS = {
    "read_note",
    "insert_note",
    "move_note",
    "delete_note",
    "set_note_text",
    "set_note_content",
}


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

    async def test_only_users_with_the_permission_see_note_tools(self):
        names = await self.tool_names()
        self.assertFalse(names & NOTE_TOOLS)
        refused = await self.call("read_note", {})
        self.assertEqual(self.error_text(refused), "INVALID_ARGUMENT: Tool read_note not found")

        await sync_to_async(self.allow_workspaces)()

        self.assertEqual(await self.tool_names(), names | NOTE_TOOLS)

    async def test_an_agent_creates_reads_and_changes_a_document(self):
        await sync_to_async(self.allow_workspaces)()
        account = await self.call_json("read_note", {})
        self.assertEqual(account["ref"], "me")
        [workspace] = account["children"]
        self.assertEqual(workspace["text"], "Personal")

        inserted = await self.call_json(
            "insert_note",
            {"parent": workspace["ref"], "kind": "document", "text": "Plan", "content": "- a\n"},
        )
        [result] = inserted["results"]
        document = await self.call_json("read_note", {"ref": result["ref"], "content": True})
        self.assertEqual((document["kind"], document["content"]), ("document", "- a\n"))

        edit = {
            "target": document["ref"],
            "content": "- b\n",
            "expected": {document["ref"]: document["version"]},
        }
        await self.call_json("set_note_content", edit)
        stale = self.error_text(await self.call("set_note_content", edit))

        current = (await sync_to_async(self.read)(workspace["ref"], "Plan.md")).blob_hash
        self.assertEqual(
            stale,
            "FAILED_PRECONDITION: 'Plan.md' changed since it was read. "
            f'Current versions: {{"{document["ref"]}": "{current}"}}',
        )

    async def test_a_tool_runs_only_its_own_operation(self):
        await sync_to_async(self.allow_workspaces)()
        account = await self.call_json("read_note", {})
        [workspace] = account["children"]

        result = await self.call(
            "insert_note", {"parent": workspace["ref"], "op": "delete", "kind": "file", "text": "x"}
        )

        self.assertTrue(self.error_text(result).startswith("INVALID_ARGUMENT: "))

    async def test_an_agent_creates_a_workspace(self):
        await sync_to_async(self.allow_workspaces)()

        await self.call_json("insert_note", {"kind": "workspace", "text": "Team"})

        account = await self.call_json("read_note", {})
        self.assertEqual([child["text"] for child in account["children"]], ["Personal", "Team"])

    async def test_other_users_workspaces_are_not_found(self):
        await sync_to_async(self.allow_workspaces)()
        other = await sync_to_async(User.objects.create_user)("other@example.test")
        workspace = await sync_to_async(Workspace.objects.create)(name="Theirs", owner=other)

        result = await self.call("read_note", {"ref": workspace.pk})

        self.assertTrue(self.error_text(result).startswith("NOT_FOUND: "))

    @override_settings(SENTRY_DSN="https://public@errors.example.test/1")
    async def test_failures_remdo_caused_are_reported_and_client_errors_are_not(self):
        await sync_to_async(self.allow_workspaces)()

        with patch("sentry_sdk.capture_exception") as capture:
            with patch("workspaces.notes.read", side_effect=DatabaseError):
                unavailable = await self.call("read_note", {})
            invalid = await self.call("read_note", {"ref": "missing"})

        self.assertTrue(self.error_text(unavailable).startswith("UNAVAILABLE: "))
        self.assertTrue(self.error_text(invalid).startswith("NOT_FOUND: "))
        [[reported], _] = capture.call_args
        self.assertEqual(capture.call_count, 1)
        self.assertIsInstance(reported.__cause__, DatabaseError)

    def read(self, workspace_id, path):
        return store.read(Workspace.objects.get(pk=workspace_id), path)
