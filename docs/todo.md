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

- Spec: `docs/outliner/note-ids.md#clipboard-semantics`.
- Follow-up: review the cut/copy prep in `tests/unit/note-ids.spec.ts` around
  the structural paste no-op tests (e.g. line ~577) for readability; make sure
  cut and copy operations are set up in a similarly clear, shared way for
  test authors.
- Follow-up: paste placement at end-of-note with children currently inserts
  after the entire subtree (next content sibling), which feels unintuitive when
  the caret sits visually above the first child. Align paste insertion with
  `docs/insertion.md` end-of-note semantics so pastes land as the first child,
  and add a focused test to lock this behavior.
- Add unit test: local delete/backspace on a marked note invalidates the cut
  marker, and a subsequent paste of the cut payload is a no-op.
- Add collab test: remote deletion of a marked note invalidates the cut marker
  and keeps paste as a no-op.
- Add E2E test: inline single-note cut removes text and never shows the cut
  marker overlay (stays in normal text-cut path).
- Open question: cut-marker invalidation listens to ListItemNode/TextNode
  mutations only; if note bodies gain non-text inline nodes, should we broaden
  the invalidation to cover those node types too?

## Test infra

- E2E runs reuse persisted collab docs (e.g., `data/collab/project/data.ysweet`),
  so failures can disappear after a run normalizes data. Add a cleanup or
  per-run `DATA_DIR`/doc-id strategy so Playwright runs are isolated and
  deterministic.
- E2E helper: add a small `readOutline(editor)` wrapper around
  `extractOutlineFromEditorState(await editor.getEditorState())` so tests don't
  call the lower-level helper directly; keep `toMatchOutline` as-is.
- Missing coverage: add a normalization test that loads a document containing
  a wrapper list item whose nested list has no list-item children (an empty
  child list), runs the load-time normalization pass, and asserts the invalid
  wrapper is removed so the resulting outline is schema-valid and stable. The
  test should also ensure the remaining notes keep their note ids and order
  intact after the cleanup.
- Collab test refactor (open questions): should we standardize on `remdo` +
  `remdo2` naming and provide a helper/fixture that returns a pre-synced second
  client next to `remdo`? If so, should the multi-client tests live under a
  dedicated folder (or similar grouping) where `remdo2` is pre-baked, or should
  it remain opt-in per test to avoid overhead?
