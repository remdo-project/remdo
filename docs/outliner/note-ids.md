# Note IDs

## Purpose

Define how RemDo assigns stable identities to notes and how those identities
compose into global references. This doc is the single source of truth for note
identity behavior and is intended to drive tests and application logic.

## Scope

This specification covers addressable notes (content list items) inside a single
RemDo document and the global reference (`noteRef`) derived from document +
note identity. Note-link identity boundaries (`docId`/`noteId` in runtime,
compaction rules at persistence boundaries) are defined in
[Links](./links.md). The document root is modeled conceptually as a note (see
`./concepts.md`), but document identity itself is runtime state owned by the
environment, not persisted as a root `noteId`.

## Definitions

- **noteId:** an opaque identifier that uniquely identifies a note within a
  single document.
- **documentId:** a runtime identifier for the active document, injected by the
  environment (for example browser routing or snapshot CLI).
- **noteRef:** a globally unique reference composed from a document ID and a
  noteId.
- **Addressable note:** any non-root note that appears as a content list item in
  the outline.
- **Document root:** the structural root for a document. It is a conceptual note
  that is not directly selectable in the editor.

## Invariants

1. Every addressable note has a `noteId`.
2. Document identity (`documentId`) is runtime state and must be injected by the
   host environment for each editor/session instance.
3. `noteId` values are unique within a document at any moment in time; different
   documents may reuse the same `noteId` values.
4. `noteId` values are stable for the lifetime of a note and do not change on
   edits, reorders, indent/outdent, or moves.
5. `noteId` values round-trip through adapters and persisted JSON boundaries
   unchanged for addressable notes.

## Lifecycle

### Creation

- Any operation that creates a new note must assign a fresh `noteId` at the
  moment of creation (keyboard insertion, paste, import, collaboration insert,
  etc.).
- `noteId` generation is a local operation using randomness; we assume it is
  effectively unique and do not require a document-wide scan at creation time.
- When a note is split into two notes, the note that remains at the original
  position retains its `noteId`, and the newly created note receives a fresh
  `noteId`.

### Duplication and copy

- Duplicated notes within a document (copy/paste, template insertion) or notes
  imported into another document must receive new `noteId` values. Content and
  structure may be copied, but identity is always new.
- When duplicating an entire document, preserve all `noteId` values so that
  `noteRef` remains unique via the new `documentId`.

### Clipboard

Identity rules for clipboard operations:

- Non-cut pastes insert copies with new `noteId` values.
- Cut/paste moves preserve existing `noteId` values for the moved notes.

Behavioral clipboard rules (placement, move validation, focus) live in
[Clipboard](./clipboard.md).

### Merge and deletion

- When two notes merge, the surviving note retains its `noteId`; the merged
  note’s `noteId` is retired.
- When a note is deleted, its `noteId` is no longer in use. Reuse is not
  intentionally enforced.

## Persisted JSON and normalization

- Persisted JSON document state must include `noteId` for addressable notes.
- Persisted JSON document state must not persist the active/current document ID
  as document-level identity (for example, not as `root.noteId` and not as a
  same-document note-link `docId`).
- Persisted JSON must keep explicit `docId` values for note links that
  target other documents.
- Note-link `docId` representation rules are defined in
  [Links](./links.md#identity-representation-boundaries) to keep this spec as
  the single source for note identity and runtime document ownership.
- On load, any missing or duplicate `noteId` values must be normalized before
  the document is exposed to the app: keep existing unique IDs and assign fresh
  IDs to missing or colliding notes (preserving document order).
- Normalized IDs must be persisted on the next save.

## Runtime document ID ownership

- Browser runtime resolves `documentId` from routing and injects it into the
  editor/collaboration runtime.
- Snapshot CLI resolves `documentId` from CLI/env inputs and injects it into the
  session/editor it initializes.
- Runtime `documentId` must remain per-editor state and must not be derived from
  global location reads inside core editor logic.
- Runtime `documentId` also drives same-document note-link rehydration at
  load/import boundaries (see [Links](./links.md)).

## Collaboration

- `noteId` generation must be collision-resistant across clients; IDs are
  created locally and synced as part of the note content.
- Remote operations must not overwrite existing `noteId` values during normal
  application.
- If a cut marker exists, any remote edit that touches a marked note cancels
  the marker to avoid ambiguous moves.

## Global references

- `noteRef` is composed as `documentId_noteId`.
- Direct-link URLs use the form `/n/<noteRef>` for non-root notes.
- The document root uses `/n/<documentId>` as its canonical URL.
- A `noteRef` is valid only while the referenced note exists in the referenced
  document.
