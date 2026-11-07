# Note operations

Note operations read and change the notes under an
[account root](./note-model.md#note-kinds) through one set of operations, following the
[unified operations principle](../../principles.md#consumer-apis). Editors,
agents and integrations use them alike.

## Operations

1. **Read** returns a note's text and, to a requested depth, its children, with
   each note's reference, kind and the operations it offers, and the version of
   every file read. A note at the depth limit reports whether it has children.
   When asked, it also returns a document's or plain file's content.
   **Deterministic.**
2. **Insert** adds new notes under a parent: outline notes and Markdown blocks
   from a Markdown fragment nested as deep as needed, documents and files,
   where a document may come with its content, or workspaces. In a document,
   the position is first, last, or before or after a sibling.
   **Deterministic.**
3. **Move** puts a note, with its children, under a new parent in the same
   workspace, at a position as for Insert. **Deterministic.**
4. **Delete** removes a note. A note with children is removed only when the
   operation says so, along with its children. The result lists the IDs that
   disappear. **Deterministic.**
5. **Set text** changes a note's [text](./note-model.md#note-kinds).
   **Deterministic.**
6. **Set content** changes a document's or plain file's whole content.
   **Deterministic.**
7. **Ensure ID** returns a note's ID, writing a new one into its document when
   the note has none. **Deterministic.**

Set text and Set content take the new value, or exact replacements applied in
order, each matching exactly once in the value left by the previous one,
whitespace included. Replacements apply only to text. **Deterministic.**

## Kinds

- **Account root:** Read, Insert.
- **Workspace:** Read, Insert, Set text.
- **Folder:** Read, Insert, Move, Delete, Set text.
- **Document:** Read, Insert, Move, Delete, Set text, Set content, Ensure ID.
- **Outline note:** Read, Insert, Move, Delete, Set text, Ensure ID.
- **Markdown block:** Read, Move, Delete, Set text.
- **Plain file:** Read, Move, Delete, Set text, Set content.

An operation a kind doesn't offer is refused, and kinds this list doesn't name
offer none. A workspace is deleted under its
[access rules](../access/access-control.md#sources), not through these
operations.

## Calls

1. A call is an ordered list of operations within one
   [source](./note-model.md#definitions), applied all or none, with a
   workspace's file changes as one [commit](../workspaces/store.md#commits).
   Insert acts within its parent's source and every other operation within its
   target's, so a source the call creates is changed only by a later call. A
   later operation can name a note an earlier one created. **Deterministic.**
2. A call states the expected content of every file it changes, as the store
   requires. A Move, Delete or Set text of a folder also states the version of
   its [listing](../workspaces/store.md#reads), so a file added or changed under
   it since makes the call stale. **Deterministic.**
3. An operation is refused when its target path is taken, or when it would put
   a note somewhere the [text format](../../format.md) can't hold it, such as a
   heading under a deeper heading. **Deterministic.**
4. Notes an operation doesn't name keep their text, position and children. Set
   text never changes structure. Set content can change a document's outline,
   but an ID it removes must belong to a note an earlier Delete in the call
   removed. **Deterministic.**
5. A refused call names the failing operation and why, and returns the current
   versions of the files involved. A successful one returns each operation's
   result, the new references and the new versions. **Deterministic.**
6. A dry run returns a reviewable description of the change and changes
   nothing. **Deterministic.**
7. A call that changes nothing succeeds without a revision. Insert, Set text
   and Set content that would change nothing are refused. **Deterministic.**

## References

- [JMAP core (RFC 8620)](https://www.rfc-editor.org/rfc/rfc8620)
- [WebDAV (RFC 4918)](https://www.rfc-editor.org/rfc/rfc4918)
- [Roam Research MCP tools](https://github.com/Roam-Research/roam-tools/blob/master/packages/core/src/tools.ts)
- [Anytype API v2 draft](https://github.com/anyproto/anytype-heart/blob/develop/core/api/APIV2.md)
