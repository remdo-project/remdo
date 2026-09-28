# MCP server

RemDo's MCP server lets assistants such as Claude work with a user's notes,
acting through [delegated access](../access/access-control.md#delegated-access).
It is reached at `/mcp` on the server's public origin over the Streamable HTTP
transport, and follows the MCP authorization specification with RemDo as its
authorization server.

The server identifies itself with the product name, the app origin as its
website, and the app icons, so clients show RemDo's current icon without
inferring one from a favicon.

## Tools

The server exposes the [open document](../outliner/open-document.md) and
[user data](../outliner/user-data.md) reads and operations that act without a
viewer, excluding observation and capability reads, as tools. Each tool is named
after what it delegates to, whose owner defines its behavior.

- A tool addresses a document by its
  [`documentId`](../outliner/note-ids.md#definitions), which also addresses the
  document root, and an editor note by its
  [`noteAddress`](../outliner/note-ids.md#global-addresses). Results that
  identify documents or notes include their URLs.
- Each tool declares a title and whether it only reads or changes the user's
  data, so clients can require confirmation before changes.
- A failed tool call returns a tool error naming its cause.

## Limits

- **Request body:** at most 1 MiB; a larger request is refused with HTTP 413
  before any tool runs.
- **Append:** at most 1,000 notes per call, counting nested children; a larger
  append fails without changing the document.
- **Open documents:** as many at once as the server's memory allows; a call
  that cannot open its document within 30 seconds fails as busy before changing
  it.
- **RemDo API:** a request that gets no answer within 10 seconds fails; for a
  change, the error states that its outcome is unconfirmed.

## References

- [Model Context Protocol: Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
