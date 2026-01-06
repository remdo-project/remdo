# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

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

## Cut-as-move

- Structural cut: marks notes for move and populates the system clipboard with
  Lexical payload + a cut marker (`remdoCut`); content stays in place.
- Paste: moves notes only if the cut marker is still valid. If the marker is
  missing/invalid (local edit, remote edit, or clipboard changed), paste is a
  no-op and clears the marker. Clipboard remains.
- Paste attempts that would move into the marked subtree are no-ops and do not
  clear the marker.
- Inline cut (single-note text selection) is handled by Lexical; structural cut
  only applies to structural selection or multi-note range selection.
- Structural cut collapses the structural selection to the visual start so only
  the cut marker remains visible.
- Marker invalidation rule (simplicity-first): any local or remote mutation
  touching a marked note (including text edits) drops the marker. Keep the spec
  simple for now; if implementation proves easy, revisit allowing text edits
  without invalidation and update the spec accordingly.
- Implementation note: move logic uses stored head keys (not clipboard payload)
  to identify the cut subtree; keep tests/helpers aligned with this contract.
- Follow-up: refactor test helpers to split selection from cut (selection helper
  first, then a generic cut helper that validates clipboard payload) so the
  collab subtree move test (`tests/unit/collab/note-ids.collab.spec.tsx`) can
  use a shared cut path instead of inline parsing. Make sure to unify and
  improve selection helpers first.
- Follow-up: paste placement at end-of-note with children currently inserts
  after the entire subtree (next content sibling), which feels unintuitive when
  the caret sits visually above the first child. Align paste insertion with
  `docs/insertion.md` end-of-note semantics so pastes land as the first child,
  and add a focused test to lock this behavior.

## Test infra

- E2E runs reuse persisted collab docs (e.g., `data/collab/project/data.ysweet`),
  so failures can disappear after a run normalizes data. Add a cleanup or
  per-run `DATA_DIR`/doc-id strategy so Playwright runs are isolated and
  deterministic.
- Missing coverage: add a normalization test that loads a document containing
  a wrapper list item whose nested list has no list-item children (an empty
  child list), runs the load-time normalization pass, and asserts the invalid
  wrapper is removed so the resulting outline is schema-valid and stable. The
  test should also ensure the remaining notes keep their note ids and order
  intact after the cleanup.
