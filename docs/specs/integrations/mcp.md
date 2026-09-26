# MCP server

RemDo's MCP server lets assistants such as Claude work with a user's notes,
acting through [delegated access](../access/access-control.md#delegated-access).
It is reached at `/mcp` on the server's public origin over the Streamable HTTP
transport, and follows the MCP authorization specification with RemDo as its
authorization server.

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
- A failed tool call returns a tool error.
- Tool calls open as many documents at once as the server's memory allows; a
  call that cannot open one within a bounded wait fails as busy.

## References

- [Model Context Protocol: Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
