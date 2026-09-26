# MCP server

RemDo's MCP server lets assistants such as Claude work with a user's notes,
acting through [delegated access](../access/access-control.md#delegated-access).
It is reached at `/mcp` on the server's public origin over the Streamable HTTP
transport, and follows the MCP authorization specification with RemDo as its
authorization server.

## Tools

The server exposes the [open document](../outliner/open-document.md) and
[user data](../outliner/user-data.md) operations that act without a viewer as
tools. Each tool is named after the operation it delegates to, whose owner
defines its behavior.

- A tool addresses a document by its
  [`documentId`](../outliner/note-ids.md#definitions), which also addresses the
  document root, and an editor note by its
  [`noteAddress`](../outliner/note-ids.md#global-addresses). Results that
  identify documents or notes include their URLs.
- An unavailable or ineligible target, or a rejected operation, returns a tool
  error.

## References

- [Model Context Protocol: Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
