import asyncio
import json
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import httpx2
from accounts.models import User
from allauth.idp.oidc.models import Token
from django.conf import settings
from django.db import DatabaseError
from django.test import SimpleTestCase, TransactionTestCase
from django.utils import timezone
from mcp_server.server import create_app, document_ref

from documents.editor import UNCONFIRMED, call_editor
from documents.errors import OperationError
from documents.models import Document


class McpTests(TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="mcp@example.test")
        token = Token(
            type=Token.Type.ACCESS_TOKEN,
            user=self.user,
            expires_at=timezone.now() + timedelta(hours=1),
        )
        token.set_resources([f"{settings.APP_ORIGIN}/mcp"])
        token.set_scopes(["openid"])
        token.set_value("synthetic-mcp-token")
        token.save()
        self.headers = {
            "Authorization": "Bearer synthetic-mcp-token",
            "Accept": "application/json, text/event-stream",
        }

    async def request(self, body, headers=None):
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app), base_url="http://mcp"
            ) as client:
                return await client.post(
                    "/mcp",
                    headers={
                        "Content-Type": "application/json",
                        **(self.headers if headers is None else headers),
                    },
                    content=json.dumps(body),
                )

    async def call(self, name, arguments):
        response = await self.request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            }
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["result"]

    def error_text(self, result):
        self.assertTrue(result["isError"])
        return result["content"][0]["text"]

    async def test_shared_http_service_handles_repeated_requests_without_exhausting_connections(
        self,
    ):
        from remdo.asgi import application

        async with application.router.lifespan_context(application):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(application), base_url=settings.APP_ORIGIN
            ) as client:
                self.assertEqual((await client.get("/api/health")).status_code, 200)
                self.assertEqual((await client.post("/mcp")).status_code, 401)
                tools = await client.post(
                    "/mcp",
                    headers=self.headers,
                    json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                )
                self.assertEqual(tools.status_code, 200)
                # Request-local ASGI threads must return connections; the previous
                # persistent setting exhausted PostgreSQL during repeated requests.
                for _ in range(8):
                    responses = await asyncio.gather(
                        *[client.get("/api/documents", headers=self.headers) for _ in range(16)]
                    )
                    for response in responses:
                        self.assertEqual(response.status_code, 200, response.text)

    async def test_shared_service_keeps_all_mcp_methods_with_the_native_transport(self):
        from django.core.asgi import get_asgi_application

        application = create_app()
        application.mount("/", get_asgi_application())
        async with application.router.lifespan_context(application):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(application), base_url=settings.APP_ORIGIN
            ) as client:
                for method in ("OPTIONS", "PUT", "PATCH", "HEAD"):
                    with self.subTest(method=method):
                        response = await client.request(method, "/mcp", headers=self.headers)
                        self.assertEqual(response.status_code, 405)
                        self.assertIn("POST", response.headers["allow"])
                        self.assertEqual((await client.request(method, "/mcp")).status_code, 401)

    async def test_extra_note_fields_cannot_expand_the_private_editor_request(self):
        # Valid wire JSON under 1 MiB; retaining these unknown numeric fields
        # would expand the private request above its limit during re-encoding.
        body = (
            '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":'
            '{"name":"append_children","arguments":{"parent":"doc","notes":'
            '[{"text":"Parent","extra":[' + "1e5," * 200000 + "1e5],"
            '"children":[{"text":"Leaf","extra":true}]}]}}}'
        )
        app = create_app()
        with patch("mcp_server.server.call_editor", return_value=["note"]) as editor:
            async with app.router.lifespan_context(app):
                async with httpx2.AsyncClient(
                    transport=httpx2.ASGITransport(app), base_url="http://mcp"
                ) as client:
                    response = await client.post(
                        "/mcp",
                        headers={**self.headers, "Content-Type": "application/json"},
                        content=body,
                    )
            self.assertEqual(response.status_code, 200)
            self.assertFalse(response.json()["result"].get("isError", False), response.text)
            editor.assert_awaited_once_with(
                "append",
                "doc",
                self.headers["Authorization"],
                noteId=None,
                notes=[{"text": "Parent", "children": [{"text": "Leaf"}]}],
            )

    async def test_validation_and_limits_refuse_writes(self):
        for name, arguments, text in [
            ("read_document", {"target": "doc", "depth": 0}, "depth"),
            (
                "rename_document",
                {"documentId": "doc_note", "title": "Title"},
                "The documentId is not valid.",
            ),
            (
                "append_children",
                {"parent": "bad/id", "notes": []},
                "The parent is not a documentId or a noteAddress.",
            ),
            (
                "set_child_list_type",
                {"noteAddress": "doc", "listType": "check"},
                "The noteAddress is not valid.",
            ),
            (
                "append_children",
                {"parent": "doc", "notes": [{"text": "Note"}] * 1001},
                "Append at most 1000 notes per call",
            ),
            (
                "create_document",
                {"title": "x" * 501},
                'RemDo rejected the request as invalid: {"title":["Ensure this field has no more than 500 characters."]}',
            ),
        ]:
            with self.subTest(name=name), patch("mcp_server.server.call_editor") as editor:
                failure = self.error_text(await self.call(name, arguments))
                self.assertTrue(failure.startswith("INVALID_ARGUMENT: "), failure)
                self.assertIn(text, failure)
                editor.assert_not_called()

    async def test_nested_validation_reports_the_first_error_in_document_order(self):
        for notes, location in [
            ([{"text": 1}, {"text": 2}], "notes.0.text"),
            (
                [{"text": "Parent", "children": [{"text": 1}, {"text": 2}]}, {"text": 3}],
                "notes.0.children.0.text",
            ),
        ]:
            with self.subTest(location=location), patch("mcp_server.server.call_editor") as editor:
                result = await self.call("append_children", {"parent": "doc", "notes": notes})
                self.assertIn(location, self.error_text(result))
                editor.assert_not_called()

    async def test_create_preserves_whitespace_in_the_title(self):
        result = await self.call("create_document", {"title": "  Notes  "})
        created = json.loads(result["content"][0]["text"])
        self.assertEqual(created["title"], "  Notes  ")
        self.assertEqual((await Document.objects.aget(pk=created["documentId"])).title, "  Notes  ")

    async def test_accepts_the_full_nested_append_limit_and_validates_nested_fields(self):
        note = {"text": "Leaf"}
        for _ in range(999):
            note = {"text": "Parent", "children": [note]}
        with patch("mcp_server.server.call_editor", return_value=["note"]):
            result = await self.call("append_children", {"parent": "doc", "notes": [note]})
        self.assertFalse(result.get("isError", False), result)
        invalid = {"text": "Parent", "children": [{"text": "Leaf", "checked": "yes"}]}
        with patch("mcp_server.server.call_editor") as editor:
            result = await self.call("append_children", {"parent": "doc", "notes": [invalid]})
        self.assertIn("notes.0.children.0.checked", self.error_text(result))
        editor.assert_not_called()

    async def test_excessive_json_nesting_is_a_parse_error_and_header_spacing_is_rejected(self):
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app), base_url="http://mcp"
            ) as client:
                response = await client.post(
                    "/mcp",
                    headers={**self.headers, "Content-Type": "application/json"},
                    content="[" * 200000 + "]" * 200000,
                )
        self.assertEqual(response.status_code, 400)
        self.assertIn(response.json()["error"]["code"], {-32700, -32600})
        response = await self.request(
            {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            headers={**self.headers, "Authorization": "Bearer  synthetic-mcp-token"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("invalid_token", response.headers["www-authenticate"])

    async def test_non_json_numeric_constants_are_parse_errors(self):
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app), base_url="http://mcp"
            ) as client:
                for constant in ("NaN", "Infinity", "-Infinity"):
                    with self.subTest(constant=constant):
                        response = await client.post(
                            "/mcp",
                            headers={**self.headers, "Content-Type": "application/json"},
                            content='{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"extra":'
                            + constant
                            + "}}",
                        )
                        self.assertEqual(response.status_code, 400)
                        self.assertIn(response.json()["error"]["code"], {-32700, -32600})

    async def test_request_body_requires_strict_utf8_json(self):
        body = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
        invalid_bodies = (
            body.encode("utf-16"),
            body.encode("utf-32"),
            b"\xef\xbb\xbf" + body.encode("utf-8"),
            b'{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"extra":"\xed\xa0\x80"}}',
        )
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app), base_url="http://mcp"
            ) as client:
                for body in invalid_bodies:
                    with self.subTest(body=repr(body)):
                        response = await client.post(
                            "/mcp",
                            headers={**self.headers, "Content-Type": "application/json"},
                            content=body,
                        )
                        self.assertEqual(response.status_code, 400)
                        self.assertIn(response.json()["error"]["code"], {-32700, -32600})

    async def test_oversize_request_is_refused_before_mutation(self):
        before = await Document.objects.acount()
        response = await self.request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "create_document", "arguments": {"title": "x" * 1024 * 1024}},
            }
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(await Document.objects.acount(), before)

    async def test_authentication_failure_distinguishes_unavailable_database(self):
        for error in (DatabaseError(), TimeoutError()):
            with (
                self.subTest(error=type(error).__name__),
                patch("mcp_server.server.mcp_user_from_authorization", side_effect=error),
            ):
                response = await self.request({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("www-authenticate", response.headers)

    async def test_editor_reconnection_and_unconfirmed_outcome_survive_together(self):
        error = OperationError(
            "OUTCOME_UNCONFIRMED", "Check the document before retrying.", reconnect=True
        )
        with patch("mcp_server.server.call_editor", side_effect=error):
            result = await self.call(
                "append_children", {"parent": "doc", "notes": [{"text": "Note"}]}
            )
        self.assertEqual(
            self.error_text(result), "OUTCOME_UNCONFIRMED: Check the document before retrying."
        )
        self.assertEqual(
            result["_meta"]["mcp/www_authenticate"],
            [
                f'Bearer resource_metadata="{settings.APP_ORIGIN}/.well-known/oauth-protected-resource/mcp", error="invalid_token", error_description="Reconnect RemDo."'
            ],
        )

    async def test_metadata_database_failure_reports_uncertain_write(self):
        with patch("mcp_server.server.create_document", side_effect=DatabaseError()):
            result = await self.call("create_document", {"title": "Title"})
        self.assertTrue(self.error_text(result).startswith("OUTCOME_UNCONFIRMED: "))
        with patch("mcp_server.server.Document.objects.accessible_to", side_effect=DatabaseError()):
            result = await self.call("list_documents", {})
        self.assertEqual(
            self.error_text(result), "UNAVAILABLE: RemDo is unavailable. Try again later."
        )

    async def test_invalid_unicode_tool_names_remain_coded_errors(self):
        result = await self.call("unknown-\ud800", {})
        self.assertEqual(
            self.error_text(result), r"INVALID_ARGUMENT: Tool unknown-\ud800 not found"
        )

    async def test_invalid_unicode_titles_do_not_commit_or_poison_the_inventory(self):
        document = await Document.objects.filter(owner=self.user).afirst()
        before = await Document.objects.acount()
        for name, arguments in (
            ("create_document", {"title": "a\ud800b"}),
            ("rename_document", {"documentId": document.pk, "title": "a\ud800b"}),
        ):
            with self.subTest(name=name):
                result = await self.call(name, arguments)
                self.assertTrue(self.error_text(result).startswith("INVALID_ARGUMENT: "))
                self.assertEqual(await Document.objects.acount(), before)
                await document.arefresh_from_db()
                self.assertNotIn("\ud800", document.title)
                self.assertFalse((await self.call("list_documents", {})).get("isError", False))

    async def test_metadata_connection_failure_is_unavailable_before_a_write_starts(self):
        with (
            patch("mcp_server.server.connection") as database,
            patch("mcp_server.server.create_document") as create,
        ):
            database.ensure_connection.side_effect = DatabaseError()
            result = await self.call("create_document", {"title": "Title"})
        self.assertEqual(
            self.error_text(result), "UNAVAILABLE: RemDo is unavailable. Try again later."
        )
        create.assert_not_called()

    async def test_metadata_deadline_does_not_claim_a_write_was_cancelled(self):
        for name, arguments, code in (
            ("list_documents", {}, "UNAVAILABLE"),
            ("create_document", {"title": "Title"}, "OUTCOME_UNCONFIRMED"),
            ("rename_document", {"documentId": "doc", "title": "Title"}, "OUTCOME_UNCONFIRMED"),
        ):
            # The auth query succeeds; the metadata worker outlives its deadline.
            worker = AsyncMock(side_effect=[self.user, TimeoutError()])
            with self.subTest(name=name), patch("mcp_server.server.database_call", worker):
                result = await self.call(name, arguments)
            self.assertTrue(self.error_text(result).startswith(f"{code}: "))


class EditorTransportTests(SimpleTestCase):
    async def dispatch(self, operation, handler, **arguments):
        real_client = httpx2.AsyncClient

        def client(**kwargs):
            return real_client(transport=httpx2.MockTransport(handler), **kwargs)

        with patch("documents.editor.httpx2.AsyncClient", client):
            return await call_editor(operation, "doc", "Bearer synthetic", **arguments)

    async def test_forwards_bearer_and_unicode_without_expanding_the_body(self):
        text = "会" * 250_000

        def handler(request):
            self.assertEqual(str(request.url), f"{settings.COLLAB_SERVER_ORIGIN}/internal/editor")
            self.assertEqual(request.headers["Authorization"], "Bearer synthetic")
            self.assertEqual(
                request.headers["X-Remdo-Collaboration-Secret"], settings.COLLAB_INTERNAL_SECRET
            )
            self.assertLess(len(request.content), 1024 * 1024)
            self.assertEqual(json.loads(request.content)["notes"][0]["text"], text)
            return httpx2.Response(200, json={"result": ["note"]})

        self.assertEqual(await self.dispatch("append", handler, notes=[{"text": text}]), ["note"])

    async def test_lost_invalid_and_timed_out_write_replies_are_never_retried(self):
        for outcome in ("disconnect", "timeout", "invalid-json", "invalid-result", "redirect"):
            calls = []

            def handler(request):
                calls.append(request)
                if outcome == "disconnect":
                    raise httpx2.RemoteProtocolError("Lost reply")
                if outcome == "timeout":
                    raise httpx2.ReadTimeout("No reply")
                if outcome == "invalid-json":
                    return httpx2.Response(200, text="incomplete")
                if outcome == "redirect":
                    return httpx2.Response(302, headers={"Location": "https://untrusted.example"})
                return httpx2.Response(200, json={"result": "not-an-id-list"})

            with self.subTest(outcome=outcome), self.assertRaises(OperationError) as caught:
                await self.dispatch("append", handler, notes=[{"text": "Note"}])
            self.assertEqual(caught.exception.code, "OUTCOME_UNCONFIRMED")
            self.assertEqual(str(caught.exception), UNCONFIRMED)
            self.assertEqual(len(calls), 1)

    async def test_a_refused_connection_and_a_failed_read_are_unavailable(self):
        for operation, error in (
            ("append", httpx2.ConnectError("Refused")),
            ("read", httpx2.ReadTimeout("No reply")),
        ):

            def handler(request):
                raise error

            with self.subTest(operation=operation), self.assertRaises(OperationError) as caught:
                await self.dispatch(operation, handler)
            self.assertEqual(caught.exception.code, "UNAVAILABLE")

    async def test_preserves_editor_error_and_reconnect_flag(self):
        def handler(request):
            return httpx2.Response(
                200,
                json={
                    "error": {
                        "code": "OUTCOME_UNCONFIRMED",
                        "message": "Check before retrying.",
                        "reconnect": True,
                    }
                },
            )

        with self.assertRaises(OperationError) as caught:
            await self.dispatch("setChildListType", handler, noteId="note", listType="check")
        self.assertEqual(caught.exception.code, "OUTCOME_UNCONFIRMED")
        self.assertTrue(caught.exception.reconnect)

    async def test_pre_dispatch_rejections_are_not_uncertain_writes(self):
        for status in (403, 413, 503):

            def handler(request):
                return httpx2.Response(status)

            with self.subTest(status=status), self.assertRaises(OperationError) as caught:
                await self.dispatch("append", handler, notes=[{"text": "Note"}])
            self.assertEqual(caught.exception.code, "UNAVAILABLE")

    async def test_lone_surrogates_are_escaped_before_dispatch(self):
        def handler(request):
            self.assertIn(b"\\ud800", request.content)
            self.assertEqual(json.loads(request.content)["notes"][0]["text"], "\ud800")
            return httpx2.Response(200, json={"result": ["note"]})

        self.assertEqual(
            await self.dispatch("append", handler, notes=[{"text": "\ud800"}]), ["note"]
        )


class DocumentAddressTests(SimpleTestCase):
    def test_addresses_use_the_sdk_whitespace_rules(self):
        for whitespace in [" ", "\t\n\r", "\u00a0", "\u2000", "\u2028", "\u3000", "\ufeff"]:
            with self.subTest(whitespace=repr(whitespace)):
                self.assertEqual(
                    document_ref(f"{whitespace}doc{whitespace}", "invalid"), ("doc", None)
                )
                self.assertEqual(
                    document_ref(
                        f"{whitespace}doc{whitespace}_{whitespace}note{whitespace}", "invalid"
                    ),
                    ("doc", "note"),
                )

    def test_python_only_whitespace_is_rejected(self):
        for whitespace in ["\x1c", "\x1d", "\x1e", "\x1f", "\x85"]:
            with (
                self.subTest(whitespace=repr(whitespace)),
                self.assertRaises(OperationError) as error,
            ):
                document_ref(f"{whitespace}doc", "invalid")
            self.assertEqual(error.exception.code, "INVALID_ARGUMENT")
