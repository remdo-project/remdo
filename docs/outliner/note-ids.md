# Note IDs

## Purpose

Define how RemDo assigns stable identities to notes and how those identities
compose into global references. This doc is the single source of truth for note
identity behavior and is intended to drive tests and application logic.

## Scope

This specification covers addressable notes (content list items) inside a single
RemDo document and the global reference (`noteRef`) derived from document + note
identity. The document root is modeled as a note whose `noteId` equals the
document ID. This spec does not define the format or storage of document IDs.

## Definitions

- **noteId:** an opaque identifier that uniquely identifies a note within a
  single document.
- **noteRef:** a globally unique reference composed from a document ID and a
  noteId.
- **Addressable note:** any non-root note that appears as a content list item in
  the outline.
- **Document root:** the structural root for a document; a note whose `noteId`
  equals the document ID and is not directly selectable in the editor.

## Invariants

1. Every note, including the document root, has a `noteId`.
2. The document root uses `noteId === documentId`.
3. `noteId` values are unique within a document at any moment in time; different
   documents may reuse the same `noteId` values.
4. `noteId` values are stable for the lifetime of a note and do not change on
   edits, reorders, indent/outdent, or moves.
5. `noteId` values round-trip through adapters and serialization unchanged.

## Lifecycle

### Creation

- Any operation that creates a new note must assign a fresh `noteId` at the
  moment of creation (keyboard insertion, paste, import, collaboration insert,
  etc.).
- When a note is split into two notes, the note that remains at the original
  position retains its `noteId`, and the newly created note receives a fresh
  `noteId`.

### Duplication and copy

- Duplicated notes within a document (copy/paste, template insertion) or notes
  imported into another document must receive new `noteId` values. Content and
  structure may be copied, but identity is always new.
- When duplicating an entire document, preserve all `noteId` values so that
  `noteRef` remains unique via the new `documentId`.

### Clipboard semantics

- When pasting, preserve each pasted `noteId` unless it conflicts with an
  existing `noteId` in the target document.
- The source of the clipboard payload does not matter; the same rules apply to
  paste-from-self, paste-from-another document, or any other import source.
- The `noteId` values of any structurally selected notes being replaced are
  excluded from conflict checks, so cut/move/paste-in-place preserves ids.
- If the clipboard payload contains duplicate `noteId` values, preserve the
  first occurrence within the pasted payload and regenerate the rest to keep
  the document unique. Existing document notes always win over pasted ids; the
  order rule applies only within the pasted payload.
- If a pasted `noteId` conflicts with an existing `noteId` outside the replaced
  selection, regenerate that `noteId` (and only that one) before insertion.
- Practical paste algorithm: build `reservedIds = allIdsInDoc - idsInReplacedSubtree`,
  then walk the pasted subtree in document order. For each node, assign a new
  id if it is missing/empty, already used earlier in the pasted payload, or
  collides with `reservedIds`, and add each assigned id to the running used set.

### Merge and deletion

- When two notes merge, the surviving note retains its `noteId`; the merged
  note’s `noteId` is retired.
- When a note is deleted, its `noteId` is no longer in use. Reuse is not
  intentionally enforced.

## Serialization and normalization

- Serialized document states must include `noteId` for every note (including
  the document root).
- On load, any missing or duplicate `noteId` values must be normalized before
  the document is exposed to the app: keep existing unique IDs and assign fresh
  IDs to missing or colliding notes (preserving document order).
- Normalized IDs must be persisted on the next save.

## Collaboration

- `noteId` generation must be collision-resistant across clients; IDs are
  created locally and synced as part of the note content.
- Remote operations must not overwrite existing `noteId` values during normal
  application, but normalization is allowed to resolve duplicates.
- After sync (and on load), resolve duplicate ids using the same clipboard
  conflict rules.

## Global references

- `noteRef` is composed as `documentId_noteId`.
- Direct-link URLs use the form `/n/<noteRef>` for non-root notes.
- The document root uses `/n/<documentId>` as its canonical URL.
- A `noteRef` is valid only while the referenced note exists in the referenced
  document.
