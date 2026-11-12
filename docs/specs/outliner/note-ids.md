# Note IDs

Addressable [editor notes](./note-model.md#note-kinds) have stable identity
within a document; a global `noteAddress` combines document and note identity.
[Links](./links.md) defines note-link runtime and persistence boundaries.
[IDs in workspaces](#ids-in-workspaces) cover outline notes and documents in a
workspace; the other sections cover editor notes.

## Definitions

- **noteId:** an opaque identifier that uniquely identifies a note within a
  single document.
- **documentId:** a runtime identifier for the active document, injected by the
  environment (for example browser routing or a headless tool). Document identity
  is globally unique as defined in [Architecture](../../architecture.md#document-identity).
- **noteAddress:** a globally unique address composed from a document ID and a noteId.
- **Addressable note:** any non-root note that appears as a content list item in
  the outline (the document root note, owned by [Note model](./note-model.md#definitions), is not addressable).

## Invariants

1. Every addressable note has a `noteId`.
2. Document identity (`documentId`) is runtime state and must be injected by the
   host environment for each editor/session instance.
3. `noteId` values are unique within a document at any moment in time.
4. An addressable note's `noteId` must not equal the active `documentId`.
5. `noteId` values are stable for the lifetime of a note and do not change on
   edits, reorders, indent/outdent, or moves.
6. `noteId` values round-trip through adapters and persisted JSON boundaries
   unchanged for addressable notes.

## Lifecycle

### Creation

- Any operation that creates a new note must assign a fresh `noteId` at the
  moment of creation.
- `noteId` generation is a local operation using randomness; we assume it is
  effectively unique and do not require a document-wide scan at creation time.
- When a note is split, the original note retains its `noteId` and every note
  created by the split receives a fresh `noteId`.
  [Insertion](./insertion.md#default-behavior-caret-selection) defines which
  text and structure each note keeps.

### Duplication and copy

- Duplicated notes within a document (copy/paste, template insertion) or notes
  imported into another document must receive new `noteId` values. Content and
  structure may be copied, but identity is always new.
- When duplicating an entire document, preserve all `noteId` values so that
  `noteAddress` remains unique via the new `documentId`.

### Clipboard

Internal structural copy data omits `noteId` values. Cut data retains them and
records its source `documentId`. Paste resolves the identity of the whole
incoming note set before insertion:

1. Copy follows normal note creation, which assigns fresh `noteId` values to
   every pasted note.
2. Cut preserves every incoming `noteId` only when the source and destination
   are the same document and none of the incoming IDs exists in the destination.
3. Any collision, cross-document cut, or other structural clipboard data has
   all incoming note IDs removed before insertion and follows the same normal
   note creation path as copy.

The decision uses no pending source-editor state. Consequently, the first
same-document structural paste after a cut can preserve identity; after those
IDs exist again, later structural pastes of the same clipboard data create new
identities.

Behavioral clipboard rules (capture, removal, placement, and focus) live in
[Clipboard](./clipboard.md).

### Merge and deletion

- When two notes merge, the surviving note retains its `noteId`; the merged
  note’s `noteId` is retired.
- When a note is deleted, its `noteId` is no longer in use. Reuse is not
  intentionally enforced.

## Persisted JSON and normalization

- [Persisted JSON state](./links.md#definitions) must include `noteId` for addressable notes.
- Persisted JSON state must not persist the active document ID as document-level
  identity.
- On load, any missing or duplicate `noteId` values, or a `noteId` equal to the
  active `documentId`, must be normalized before the document is exposed to the
  app: keep existing unique IDs and assign fresh IDs to missing or colliding
  notes (preserving [document order](./note-model.md#definitions)).
- Normalized IDs must be persisted on the next save.

## Runtime document ID ownership

- Browser runtime resolves `documentId` from routing and injects it into the
  editor/collaboration runtime.
- Headless tools inject the `documentId` of the document they open into the
  session/editor they initialize.
- Runtime `documentId` must remain per-editor state and must not be derived from
  global location reads inside core editor logic.

## Collaboration

- `noteId` generation must be collision-resistant across clients; IDs are
  created locally and synced as part of the note content.
- Remote operations must not overwrite existing `noteId` values during normal application.
- A [structural cut](./clipboard.md#structural-selection) syncs as an ordinary
  immediate deletion. Remote edits do not cancel or alter its clipboard snapshot.
- Paste resolves identity against the destination state at the time it is
  applied; IDs introduced or restored by remote operations count as collisions.

## Global addresses

- `noteAddress` is composed as `documentId_noteId`.
- Direct-link URLs use the form `/n/<noteAddress>` for non-root notes.
- All document roots use `/n/<documentId>`. [Home](./home.md) uses `/`.
- A `noteAddress` is valid only while the referenced note exists in the referenced
  document.

## IDs in workspaces

1. An outline note or [document](./note-model.md#note-kinds) in a workspace has
   an ID only once a link points to it or a caller ensures one; the ID is
   written into its document's text, as the [text format](../../format.md)
   spells it.
2. An ID is unique across its workspace and resolves there as a `note:` link;
   a `note:` link holding a `<workspaceId>_<id>` reference resolves in that
   workspace on the same server. A
   note keeps its ID through every [note operation](./note-operations.md)
   except Delete, including a move to another document. **Deterministic.**
3. Inserted or copied notes start without an ID; a fragment carrying one is
   refused. **Deterministic.**
4. A note's `id` [property](../../format.md#properties) belongs to the note,
   not to its children: Read reports it as the note's ID, Set text leaves it,
   and leaf and fold rules ignore it. Set content can't add an ID the document
   lacked. **Deterministic.**
5. When text written outside RemDo gives two notes one ID, reads report both,
   and a reference to that ID resolves to neither.
6. A [reference](./note-model.md#note-kinds) is `me` for the caller's account
   root, `<workspaceId>` for a workspace, `<workspaceId>_<id>` for a note with
   an ID, and `<workspaceId>/<path>` for a folder or file. Any other note of a
   document has a temporary reference that Read returns, valid while its
   document is unchanged; its form isn't part of the contract.
   **Deterministic.**
