# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

## Align note indent/outdent helpers with Lexical

1. `$getOrCreateChildList` omits copying text format and style from the source
   `ListNode`/`ListItemNode`, unlike Lexical, so new wrappers lose typography.

## Note ids in production

Goal: every note (content list item) always has a `noteId`, including newly
created notes and collab insertions.

1. ✅ Done — Document behavior in `docs/outliner/note-ids.md` and link it from
   `docs/outliner/index.md` + `docs/outliner/concepts.md`.
2. Single source of truth: add a small editor-layer utility for `noteId`
   generation (shared helper) and thread it through every note-creation path.
3. Audit all note-creation paths (Enter insertions, paste/clipboard import,
   duplication, structural splits/merges, collab insertions, full-document
   duplication) and ensure each creates or preserves `noteId` per the spec.
4. Add a normalization pass on load that backfills missing `noteId` values and
   resolves duplicates (preserve first in document order, reassign the rest).
5. Persist normalized IDs on the next save and update schema validation to
   require `noteId` on every content list item.
6. Add collaboration tests to verify deterministic ID preservation across
   clients, including concurrent inserts and copy/paste.
7. Update fixtures and test helpers to require `noteId` for all notes; remove
   label/text-based fallbacks in matchers and selection helpers.
8. Once the above is stable, simplify selection/assertion helpers to use
   `noteId` only and drop any “find by text” helpers.
9. Consolidate test-only “get noteId or throw” logic into a shared helper to
   avoid duplication across selection utilities and matchers.
10. Re-evaluate `toMatchSelection` after the refactor and drop it if it is no
    longer used (or replace call sites with `toMatchSelectionIds`).

## Harden editor schema validator tests

1. Extract shared builders for editor schema fixtures to cut duplication.
2. Add passing fixture for wrapper `ListItemNode`s with valid preceding
   siblings.
3. Add mixed valid/invalid nested list fixture to confirm validator behavior.
4. Reuse editor schema fixtures across other tests that need serialized states.

## Collab undo/redo determinism (unit tests)

Make collaboration-mode undo/redo assertions deterministic so unit tests can
reliably validate `UNDO_COMMAND`/`REDO_COMMAND` after structural edits.

1. Add a test-only bridge API for seeding fixtures without polluting undo
   history: apply initial content via a Yjs transaction with a non-tracked
   origin and clear the UndoManager stacks after seeding.
2. Ensure fixture load/clear explicitly resets history so subsequent edits
   produce a single, predictable undo step (unskip the structural delete
   undo/redo unit test once stable).
3. Unskip `tests/unit/deletion.spec.ts` “restores text and structure via
   undo/redo after structural deletion” in collab mode once the above is in
   place, and keep it as a required regression check.

## Outline helper unit tests

- Add coverage for `list-structure` helpers (content/wrapper detection,
  child-list creation, wrapper cleanup) and `selection-utils` helpers (selected
  notes) to lock behaviors.
- Prefer unit tests near the helpers; keep fixtures minimal and mirror current
  tree shapes in `tests/fixtures`.

## InsertionPlugin

1. [P1] Mid-note split still violates docs/insertion.md: falling through to
   Lexical’s default Enter creates a new list item below the current note and
   moves the caret into it, instead of inserting the prefix as a new sibling
   above and keeping the caret in the original note. That means the documented
   middle-of-note behavior (split-above, caret stays on trailing text) is still
   unimplemented. (src/editor/plugins/InsertionPlugin.tsx:79-92)
2. [P1] Start/end detection only checks the anchor text node’s offset. With
   formatted or decorator splits inside a note (multiple text nodes), placing
   the caret at the boundary of a later span yields offset === 0 or offset ===
   textNode.getTextContentSize() even though there is preceding/following text
   in the note. That misclassifies mid- note positions as start/end and triggers
   the wrong insertion path. (src/editor/plugins/InsertionPlugin.tsx:75-90)
