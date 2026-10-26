import json

from mcp import types

DOCUMENT_NOT_FOUND = (
    "The document is not available. Check list_documents for the documents the user can access."
)
UNCONFIRMED = (
    "RemDo did not confirm whether the request took effect. "
    "Check with list_documents before retrying."
)


def result(value):
    text = (
        value
        if isinstance(value, str)
        else json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    )
    return types.CallToolResult(content=[types.TextContent(type="text", text=text)])


def failure(error, app_origin):
    metadata = None
    if error.reconnect:
        metadata = {
            "mcp/www_authenticate": [
                f'Bearer resource_metadata="{app_origin}/.well-known/oauth-protected-resource/mcp", '
                'error="invalid_token", error_description="Reconnect RemDo."'
            ]
        }
    # Invalid arguments may contain lone UTF-16 surrogates; diagnostics must be UTF-8.
    text = f"{error.code}: {error}".encode("utf-8", errors="backslashreplace").decode("utf-8")
    return types.CallToolResult(
        is_error=True,
        content=[types.TextContent(type="text", text=text)],
        _meta=metadata,
    )
