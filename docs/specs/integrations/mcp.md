# MCP server

RemDo's MCP server lets assistants such as Claude work with a user's notes,
acting through [delegated access](../access/access-control.md#delegated-access).
It is reached at `/mcp` on the server's public origin over the Streamable HTTP
transport, and follows the MCP authorization specification with RemDo as its
authorization server.

The server identifies itself with the product name, the app origin as its
website, and the app icons, so clients show RemDo's current icon without
inferring one from a favicon. It also gives clients usage guidance: write
outlines whose top-level notes are short topic titles and whose parents
summarize the details nested beneath them, keep each topic in its own
descriptively titled document, and read a document before extending or relying
on it. The append tool's description repeats the outline guidance because some
clients ignore server guidance.

The [OpenAI plugin](openai-plugin.md) distributes the hosted MCP connection for ChatGPT and Codex.

## Tools

The server exposes tools that list, create, and rename the user's documents,
read a document or one note's subtree, append notes, and set a note's child
[list type](../outliner/list-types.md#supported-types). A tool delegating to an
[open document](../outliner/open-document.md) or
[user data](../outliner/user-data.md) operation is named after it, and that
operation's owner defines its behavior.

- A tool addresses a document by its
  [`documentId`](../outliner/note-ids.md#definitions), which also addresses the
  document root, and an editor note by its
  [`noteAddress`](../outliner/note-ids.md#global-addresses). Results that
  identify documents or notes include their URLs.
- Reading a document, or the addressed note and its descendants, returns every
  editor note in document order with its nesting, each list's type, and each
  note's content text, checked state, body text, and URL. A read limited to a
  number of levels, counting the top-level notes or the addressed note as the
  first, reports how many children each note on the last level hides. Reading
  does not change the document, so it omits the URL of a note whose ID
  [load-time normalization](../outliner/note-ids.md#persisted-json-and-normalization)
  would first have to store.
- Each tool declares a title, that it requires the user's authorization, and
  whether it only reads or changes the user's data, so clients can require
  confirmation before changes.
- A failed tool call returns a tool error whose text begins with one of these
  codes, followed by its cause and the action that applies:
  - `INVALID_ARGUMENT`: the call cannot be performed as given, because an
    argument is malformed, the target cannot take the operation, or a
    [limit](#limits) is exceeded. Correct the call.
  - `NOT_FOUND`: the document or note is unavailable. A document that does not
    exist and one the user cannot access are reported identically, so no error
    reveals which. The message says where to find what is available.
  - `UNAUTHENTICATED`: the RemDo API rejected the call's token. The error
    includes an OAuth challenge for reconnection.
  - `PERMISSION_DENIED`: RemDo does not let the user perform the operation for a
    reason other than a document's accessibility.
  - `UNAVAILABLE`: RemDo could not be reached, or the document could not be
    opened within its [limit](#limits). Retry later.
  - `OUTCOME_UNCONFIRMED`: the call may have changed the document. Check it
    before retrying. Load-time normalization does not count as a change.
  - `INTERNAL`: any other failure.

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
- [OpenAI: Authentication](https://developers.openai.com/plugins/build/auth#triggering-authentication-ui)
