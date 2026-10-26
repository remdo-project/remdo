"""Stateless MCP transport and tool orchestration; Django owns metadata and policy."""

import asyncio
import json
import re
from contextlib import asynccontextmanager
from types import SimpleNamespace

from accounts.delegated import mcp_user_from_authorization
from asgiref.sync import sync_to_async
from django.conf import settings
from django.db import DatabaseError, connection, connections
from documents.editor import call_editor
from documents.errors import UNAVAILABLE, OperationError
from documents.models import Document
from documents.operations import create_document, rename_document
from documents.serializers import DocumentSerializer, RenameDocumentSerializer
from jsonschema import Draft7Validator
from mcp import types
from mcp.server import streamable_http
from mcp.server.lowlevel import NotificationOptions, Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from rest_framework.renderers import JSONRenderer
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from .definitions import INSTRUCTIONS, TOOLS
from .errors import DOCUMENT_NOT_FOUND, UNCONFIRMED, failure, result

DATABASE_TIMEOUT_SECONDS = 10
# Match String.trim() in the SDK's document/note address normalization.
ADDRESS_WHITESPACE = (
    "\t\n\v\f\r \u00a0\u1680"
    "\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u2028\u2029\u202f\u205f\u3000\ufeff"
)


def decode_request(body):
    def invalid_constant(value):
        raise ValueError(f"Invalid JSON constant: {value}")

    try:
        return json.loads(body.decode("utf-8"), parse_constant=invalid_constant)
    except RecursionError as error:
        raise ValueError("JSON nesting exceeds the request limit.") from error


@sync_to_async(thread_sensitive=False)
def database_call(function, *args):
    try:
        return function(*args)
    finally:
        # These executor threads have no Django request-finished signal.
        connections.close_all()


def document_ref(value, message):
    # Same ASCII identity grammar as document-routes and domain/notes/ids.
    parts = [part.strip(ADDRESS_WHITESPACE) for part in value.split("_")]
    if len(parts) not in (1, 2) or any(not re.fullmatch(r"[A-Za-z0-9]{1,20}", p) for p in parts):
        raise OperationError("INVALID_ARGUMENT", message)
    return parts[0], parts[1] if len(parts) == 2 else None


def metadata_tool(name, arguments, user):
    write_started = False
    try:
        if name == "list_documents":
            return list(Document.objects.accessible_to(user).values("id", "title"))
        if name == "create_document":
            serializer = DocumentSerializer(data={"title": arguments["title"]})
        else:
            document_id, note_id = document_ref(
                arguments["documentId"], "The documentId is not valid."
            )
            if note_id:
                raise OperationError("INVALID_ARGUMENT", "The documentId is not valid.")
            document = Document.objects.accessible_to(user).filter(pk=document_id).first()
            if document is None:
                raise OperationError("NOT_FOUND", DOCUMENT_NOT_FOUND)
            serializer = RenameDocumentSerializer(document, data={"title": arguments["title"]})
        if not serializer.is_valid():
            body = JSONRenderer().render(serializer.errors).decode()
            raise OperationError(
                "INVALID_ARGUMENT", f"RemDo rejected the request as invalid: {body}"
            )
        connection.ensure_connection()
        write_started = True
        document = (
            create_document(serializer, user)
            if name == "create_document"
            else rename_document(serializer)
        )
        return {"id": document.pk, "title": document.title}
    except DatabaseError as error:
        raise OperationError(
            "OUTCOME_UNCONFIRMED" if write_started else "UNAVAILABLE",
            UNCONFIRMED if write_started else UNAVAILABLE,
        ) from error


class RemdoServer(Server):
    def create_initialization_options(self, **kwargs):
        return super().create_initialization_options(
            notification_options=NotificationOptions(tools_changed=True), **kwargs
        )


def create_app():
    # TODO: Developer-approved temporary patch for mcp 2.3.0. Its pydantic_core parser
    # stops near 200 JSON levels (about 100 nested notes), below what the editor and the
    # former Node server accepted. Remove this override when
    # documents.test_mcp.McpTests.test_accepts_the_full_nested_append_limit_and_validates_nested_fields
    # passes without it. Replace only the transport's decoder reference, never pydantic_core itself.
    streamable_http.pydantic_core = SimpleNamespace(from_json=decode_request)
    app_origin = settings.APP_ORIGIN
    tools = [types.Tool(**definition) for definition in TOOLS]
    validators = {tool.name: Draft7Validator(tool.input_schema) for tool in tools}
    append_schema = validators["append_children"].schema
    validators["append_children"] = Draft7Validator(
        {
            **append_schema,
            "properties": {**append_schema["properties"], "notes": {"type": "array"}},
        }
    )
    note_schema = append_schema["definitions"]["__schema0"]
    note_validator = Draft7Validator(
        {
            **note_schema,
            "properties": {**note_schema["properties"], "children": {"type": "array"}},
        }
    )

    def document_url(document_id, note_id=None):
        address = f"{document_id}_{note_id}" if note_id else document_id
        return f"{app_origin}/n/{address}"

    def document_result(document):
        return {
            "documentId": document["id"],
            "title": document["title"],
            "url": document_url(document["id"]),
        }

    async def list_tools(ctx, params):
        return types.ListToolsResult(tools=tools)

    # Validate here so errors keep RemDo's coded tool envelope, including a field path.
    async def call_tool(ctx, params):
        name, arguments = params.name, params.arguments or {}
        try:
            if name not in validators:
                raise OperationError("INVALID_ARGUMENT", f"Tool {name} not found")
            validation = next(validators[name].iter_errors(arguments), None)
            if validation:
                path = ".".join(str(part) for part in validation.absolute_path)
                raise OperationError(
                    "INVALID_ARGUMENT", f"Input validation error: {path}: {validation.message}"
                )
            request = ctx.request
            authorization = request.headers["authorization"]
            if name in {"list_documents", "create_document", "rename_document"}:
                try:
                    value = await asyncio.wait_for(
                        database_call(metadata_tool, name, arguments, request.state.mcp_user),
                        DATABASE_TIMEOUT_SECONDS,
                    )
                except TimeoutError as error:
                    # Cancellation cannot stop the ORM worker or roll back a commit.
                    write = name != "list_documents"
                    raise OperationError(
                        "OUTCOME_UNCONFIRMED" if write else "UNAVAILABLE",
                        UNCONFIRMED if write else UNAVAILABLE,
                    ) from error
                return result(
                    [document_result(d) for d in value]
                    if name == "list_documents"
                    else document_result(value)
                )
            if name == "read_document":
                doc_id, note_id = document_ref(
                    arguments["target"], "The target is not a documentId or a noteAddress."
                )
                outline = await call_editor(
                    "read", doc_id, authorization, noteId=note_id, depth=arguments.get("depth")
                )
                return result(f"Document: {document_url(doc_id)}\n\n{outline}")
            if name == "append_children":
                notes = []
                pending = [
                    (note, f"notes.{index}", notes) for index, note in enumerate(arguments["notes"])
                ]
                pending.reverse()
                count = 0
                while pending:
                    note, location, siblings = pending.pop()
                    validation = next(note_validator.iter_errors(note), None)
                    if validation:
                        path = ".".join(
                            [location, *(str(part) for part in validation.absolute_path)]
                        )
                        raise OperationError(
                            "INVALID_ARGUMENT",
                            f"Input validation error: {path}: {validation.message}",
                        )
                    # Like the SDK's note parser, forward only supported fields.
                    clean = {
                        key: note[key]
                        for key in ("text", "checked", "childListType")
                        if key in note
                    }
                    siblings.append(clean)
                    if "children" in note:
                        clean["children"] = []
                        pending.extend(
                            (child, f"{location}.children.{index}", clean["children"])
                            for index, child in reversed(list(enumerate(note["children"])))
                        )
                    count += 1
                    if count > 1000:
                        raise OperationError(
                            "INVALID_ARGUMENT",
                            "Append at most 1000 notes per call, counting nested children; split the outline across calls.",
                        )
                doc_id, note_id = document_ref(
                    arguments["parent"], "The parent is not a documentId or a noteAddress."
                )
                ids = await call_editor(
                    "append", doc_id, authorization, noteId=note_id, notes=notes
                )
                return result(
                    [
                        {"noteAddress": f"{doc_id}_{id}", "url": document_url(doc_id, id)}
                        for id in ids
                    ]
                )
            doc_id, note_id = document_ref(
                arguments["noteAddress"], "The noteAddress is not valid."
            )
            if not note_id:
                raise OperationError("INVALID_ARGUMENT", "The noteAddress is not valid.")
            await call_editor(
                "setChildListType",
                doc_id,
                authorization,
                noteId=note_id,
                listType=arguments["listType"],
            )
            return result(
                {
                    "noteAddress": arguments["noteAddress"],
                    "listType": arguments["listType"],
                    "url": document_url(doc_id, note_id),
                }
            )
        except OperationError as error:
            return failure(error, app_origin)
        except Exception as error:
            if settings.SENTRY_DSN:
                import sentry_sdk

                sentry_sdk.capture_exception(error)
            return failure(
                OperationError("INTERNAL", "RemDo could not complete the request."), app_origin
            )

    server = RemdoServer(
        "remdo",
        version="1",
        title="RemDo",
        instructions=INSTRUCTIONS,
        website_url=app_origin,
        icons=[
            types.Icon(
                src=f"{app_origin}/icon-{size}.png", mime_type="image/png", sizes=[f"{size}x{size}"]
            )
            for size in (192, 512)
        ],
        on_list_tools=list_tools,
        on_call_tool=call_tool,
    )

    async def provider_descriptors(ctx, call_next):
        value = await call_next(ctx)
        if ctx.method == "tools/list":
            # ChatGPT also reads this extension outside _meta. The SDK's
            # protocol-version serializer keeps only standard descriptor fields.
            for tool in value["tools"]:
                tool["securitySchemes"] = tool["_meta"]["securitySchemes"]
        return value

    server.middleware.append(provider_descriptors)
    manager = StreamableHTTPSessionManager(
        server, stateless=True, json_response=True, max_request_body_size=1024 * 1024
    )

    async def mcp_endpoint(scope, receive, send):
        request = Request(scope)
        authorization = request.headers.get("authorization", "")
        challenge = (
            f'Bearer resource_metadata="{app_origin}/.well-known/oauth-protected-resource/mcp"'
        )
        if re.match(r"^bearer \S", authorization, re.IGNORECASE) is None:
            await Response(status_code=401, headers={"WWW-Authenticate": challenge})(
                scope, receive, send
            )
            return
        try:
            user = await asyncio.wait_for(
                database_call(mcp_user_from_authorization, authorization), DATABASE_TIMEOUT_SECONDS
            )
        except DatabaseError, TimeoutError:
            await Response(status_code=503)(scope, receive, send)
            return
        if user is None:
            await Response(
                status_code=401, headers={"WWW-Authenticate": challenge + ', error="invalid_token"'}
            )(scope, receive, send)
            return
        request.state.mcp_user = user

        await manager.handle_request(scope, receive, send)

    class McpEndpoint:
        async def __call__(self, scope, receive, send):
            await mcp_endpoint(scope, receive, send)

    @asynccontextmanager
    async def lifespan(app):
        async with manager.run():
            yield

    return Starlette(
        routes=[Route("/mcp", endpoint=McpEndpoint())],
        lifespan=lifespan,
    )
