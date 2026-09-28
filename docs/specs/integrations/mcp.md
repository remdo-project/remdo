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

The server exposes tools that list and create the user's documents, read a
document, and append notes. A tool delegating to an
[open document](../outliner/open-document.md) or
[user data](../outliner/user-data.md) operation is named after it, and that
operation's owner defines its behavior.

- A tool addresses a document by its
  [`documentId`](../outliner/note-ids.md#definitions), which also addresses the
  document root, and an editor note by its
  [`noteAddress`](../outliner/note-ids.md#global-addresses). Results that
  identify documents or notes include their URLs.
- Reading a document returns every editor note in document order with its
  nesting, content text, checked state, list type, body text, and URL. Reading
  does not change the document, so it omits the URL of a note whose ID load-time
  normalization would first have to store, and an empty document has no notes.
- Each tool declares a title and whether it only reads or changes the user's
  data, so clients can require confirmation before changes.
- A failed tool call returns a tool error naming its cause.
- Tool calls open as many documents at once as the server's memory allows; a
  call that cannot open one within a bounded wait fails as busy.

## References

- [Model Context Protocol: Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
