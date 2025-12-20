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

## Harden editor schema validator tests

1. Extract shared builders for editor schema fixtures to cut duplication.
2. Add passing fixture for wrapper `ListItemNode`s with valid preceding
   siblings.
3. Add mixed valid/invalid nested list fixture to confirm validator behavior.
4. Reuse editor schema fixtures across other tests that need serialized states.

## OutlineSelection + dataset removal

### Motivation

- Stage-2 selection currently lives only in SelectionPlugin state; Lexical’s
  `RangeSelection` still reports inline anchors because ListItemNodes cannot be
  empty. Tests rely on `rootElement.dataset.structuralSelectionKeys` to observe
  structural mode, which is brittle and DOM-specific.

### OutlineSelection concept

1. Introduce a custom `OutlineSelection` wrapper that tracks note keys and
   mirrors the progressive ladder stages.
2. Expose helpers (e.g., `editor.getOutlineSelection()`) so tests and other
   plugins can read structural selection data without touching the DOM.
3. Propagate this selection through commands like `Shift+Arrow`, Home/End, and
   structural actions so caret collapse remains accurate.

### Dataset removal

- Once `OutlineSelection` exists, drop `data-structural-selection-keys` writes
  from SelectionPlugin and have tests consume the programmatic API instead.
- Update `readSelectionSnapshot` to rely solely on Lexical’s selection or the
  new outline selection, removing the DOM fallback entirely.

## Deletion regression coverage gaps (tests)

Deletion semantics in `docs/outliner/deletion.md` rely on “previous/next note in
document order”, but the current unit/e2e suites mostly exercise same-depth
sibling merges. Add explicit regression cases for these uncovered edges so
future refactors of `DeletionPlugin` don’t silently diverge from the contract:

1. Backspace at column 0 when the previous note in document order is an empty
   leaf: delete the empty leaf; keep the non-empty note.
2. Forward `Delete` on an empty leaf when there is no next note in document
   order (empty leaf is last): delete the empty leaf.
3. Forward `Delete` on an empty leaf when the next note exists but is non-leaf
   (has children): delete the empty leaf.
4. Forward `Delete` at end-of-note when the next note in document order is not
   the next same-depth sibling (e.g. end of the last child should consider the
   parent’s next sibling).
5. Backspace at column 0 where the previous note in document order is a subtree
   tail (e.g. first root-level note after a parent-with-children should merge
   into the last descendant).
6. Spacing-rule edge cases for Backspace merges (parity with the existing
   forward-Delete spacing tests).

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

## Container image security lint

Evaluate adding Dockle to scan the built container image (complements Hadolint’s
Dockerfile checks) and decide whether to gate CI on its report.

## Outline helper unit tests

- Add coverage for `list-structure` helpers (content/wrapper detection,
  child-list creation, wrapper cleanup) and `selection-utils` helpers (selected
  notes) to lock behaviors.
- Prefer unit tests near the helpers; keep fixtures minimal and mirror current
  tree shapes in `tests/fixtures`.

## Unified Lexical test bridge (window-based)

1. Consider letting `Editor` accept a `docId` prop that overrides URL parsing
   (tests/stories could set it directly; production would keep URL as default),
   with optional history sync toggle to avoid mutating location in test
   harnesses.
2. Remove any legacy test-only components once the bridge is wired, and note the
   transition in docs so the prior harness doesn’t reappear.

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

## Selection edge-case coverage (empty notes)

1. Cmd/Ctrl+A on a top-level empty note at the end of the list (no next sibling)
   should select only that note and not collapse.
2. Shift+Up from the same nested empty note should only select that note (not
   its previous sibling).
3. Structural commands (indent/outdent/reorder/delete) after Cmd/Ctrl+A on the
   empty note should affect only that note (not the sibling).
4. Multi-press Cmd/Ctrl+A from the empty note: first press selects only that
   note, second press selects sibling slab, third hoists parent.
5. Collapse from structural selection on an empty note via Esc or plain arrows
   should land a caret in that note (high importance, low complexity).
6. Shift+Up/Shift+Down from an empty parent that has children should select the
   whole subtree (high importance, medium complexity).
7. Shift+Left/Right on an empty note should stay a no-op without changing
   progressive stage (medium importance, low complexity).
8. Mixed range where one endpoint is an empty note and the other is non-empty
   should still be contiguous and stable after snapping (medium importance,
   medium complexity).

## Lexical fixture trust + minified snapshot plan

Goals:

- Make every JSON fixture mechanically trustworthy: loadable, schema-valid, and
  checked against an explicit outline.
- Reduce review noise by producing a stable, minified representation for each
  fixture.
- Keep the approach minimal and refactor-friendly; steps can change as we learn,
  but the goals stay fixed.

Plan steps (adjust as needed while refactoring):

1. Inventory `tests/fixtures/*.json` and decide the canonical fixture set (e.g.,
   keep or drop duplicates like `main.json`).
2. Extend the per-fixture coverage in
   `tests/unit/internal/outline-matcher.spec.ts` (or add a new fixtures spec) so
   every fixture:
   - loads via `remdo.load`,
   - asserts `toMatchOutline` with a fixture-specific outline,
   - calls `assertEditorSchema` explicitly (even though TestBridge already
     checks it).
3. After load, run `minifyEditorState(remdo.getEditorState())`, serialize
   deterministically, and compare to a committed minified snapshot; keep the
   load-critical fields (`format/indent/direction`, list `listType/start/tag`,
   text `detail/format/mode/style`, and listitem `value`) so fixtures remain
   directly parseable. Canonical minified fixtures should replace the current
   `tests/fixtures/*.json` bodies, while temp outputs written during test runs
   go under `data/...`.
4. Add a tiny helper for minified fixture IO (read/write/compare) so the tests
   stay concise.
5. Generate or refresh the canonical minified fixtures for all entries, and
   document the regeneration command/flow next to the plan.
6. Optional sanity check: ensure
   `minifyEditorState(JSON.parse(originalFixture))` matches the post-load
   minified state to detect parser normalization; drop this if it proves noisy.
7. Add a guard test that enumerates fixture filenames (excluding
   `tests/fixtures/editor-schema/**`) and fails if any are missing from the
   per-fixture coverage list so new fixtures cannot land without an
   outline/schema check.
8. Optional: add an `inflateEditorState` helper that rehydrates missing default
   fields before load to allow more aggressive minification; keep `listitem.value`
   even with inflation.
