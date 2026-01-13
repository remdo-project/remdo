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

### Clipboard semantics

- Paste regenerates `noteId` values when inserting non-cut clipboard payloads
  (copy = duplicate with new ids).
- Cut is split by selection type:
  - Inline text ranges within a single note perform a normal text cut.
  - Structural selections mark the selected notes for move (content stays in
    place) and also populate the system clipboard with the same payload as copy.
  - After a structural cut, the structural selection collapses to the visual
    start so the cut marker is the only highlight left in the editor.
- Paste applies the pending move when a cut marker is active, moving the live
  nodes with their existing ids. If the clipboard payload is marked as cut but
  the marker is missing or invalidated, paste is a no-op. If the payload is not
  a cut payload, paste inserts a copy with new ids.
- Paste attempts that would move into the marked subtree are no-ops and do not
  clear the marker.
- Any new copy or cut clears the existing cut marker. Pasting a non-cut payload
  also clears the marker.
- If a marked note is touched by any mutation (text or structural, local or
  remote) before paste, the cut marker is canceled.

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
  application.
- If a cut marker exists, any remote edit that touches a marked note cancels
  the marker to avoid ambiguous moves.

## Global references

- `noteRef` is composed as `documentId_noteId`.
- Direct-link URLs use the form `/n/<noteRef>` for non-root notes.
- The document root uses `/n/<documentId>` as its canonical URL.
- A `noteRef` is valid only while the referenced note exists in the referenced
  document.
