# Note IDs

Addressable [editor notes](./note-model.md#note-kinds) have stable identity
within a document; a global `noteRef` combines document and note identity.
[Links](./links.md) defines note-link runtime and persistence boundaries.

## Definitions

- **noteId:** an opaque identifier that uniquely identifies a note within a
  single document.
- **documentId:** a runtime identifier for the active document, injected by the
  environment (for example browser routing or snapshot CLI). Document identity
  is globally unique as defined in [Architecture](../../architecture.md#document-identity).
- **noteRef:** a globally unique reference composed from a document ID and a noteId.
- **Addressable note:** any non-root note that appears as a content list item in
  the outline (the document root note, owned by [Note model](./note-model.md#definitions), is not addressable).

## Invariants

1. Every addressable note has a `noteId`.
2. Document identity (`documentId`) is runtime state and must be injected by the
   host environment for each editor/session instance.
3. `noteId` values are unique within a document at any moment in time.
4. `noteId` values are stable for the lifetime of a note and do not change on
   edits, reorders, indent/outdent, or moves.
5. `noteId` values round-trip through adapters and persisted JSON boundaries
   unchanged for addressable notes.

## Lifecycle

### Creation

- Any operation that creates a new note must assign a fresh `noteId` at the
  moment of creation.
- `noteId` generation is a local operation using randomness; we assume it is
  effectively unique and do not require a document-wide scan at creation time.
- When a note is split into two notes, the note that keeps the original note's
  children retains its `noteId`, and the newly created note receives a fresh
  `noteId`. [Insertion](./insertion.md#default-behavior-caret-selection) defines which
  text each note keeps.

### Duplication and copy

- Duplicated notes within a document (copy/paste, template insertion) or notes
  imported into another document must receive new `noteId` values. Content and
  structure may be copied, but identity is always new.
- When duplicating an entire document, preserve all `noteId` values so that
  `noteRef` remains unique via the new `documentId`.

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
- On load, any missing or duplicate `noteId` values must be normalized before
  the document is exposed to the app: keep existing unique IDs and assign fresh
  IDs to missing or colliding notes (preserving [document order](./note-model.md#definitions)).
- Normalized IDs must be persisted on the next save.

## Runtime document ID ownership

- Browser runtime resolves `documentId` from routing and injects it into the
  editor/collaboration runtime.
- Snapshot CLI resolves `documentId` from CLI/env inputs and injects it into the
  session/editor it initializes.
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

## Global references

- `noteRef` is composed as `documentId_noteId`.
- Direct-link URLs use the form `/n/<noteRef>` for non-root notes.
- The signed-in user's local Home document root uses `/` as its canonical URL.
  Other document roots use `/n/<documentId>`.
- A `noteRef` is valid only while the referenced note exists in the referenced document.
