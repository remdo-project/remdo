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

## Selection follow-ups (post-refactor)

### Simplify

1. Collapse repetitive command registration in
   `src/editor/plugins/SelectionCollapsePlugin.tsx` into a small map-based
   helper to cut boilerplate.
2. Merge structural highlight helpers in
   `src/editor/plugins/SelectionPlugin.tsx` (class + metrics + clear) into a
   single renderer to avoid scattered side effects.
3. Unify DOM selection helpers in `tests/unit/selection.spec.ts` into
   node-based helpers (`collapse/extend`) now that we accept `Text | Element`.
4. In `src/editor/outline/selection/store.ts`, reduce repeated `WeakMap` reads
   per accessor (cache once per call).

### Robustness

1. Guard `installOutlineSelectionHelpers` against future Lexical API collisions:
   prefer a `defineProperty` or `('selection' in editor)` check instead of only
   `hasOwnProperty`.
2. Prevent accidental mutation of stored selection arrays by returning copies
   (or freezing at creation time) for `heads()` / `selectedKeys()`.
3. Recompute structural highlight metrics on scroll/resize while structural
   selection is active, not just on selection updates.
4. In `selection/resolve.ts`, fall back to element-based ranges when boundary
   text nodes are missing (empty notes) so snap payloads still apply.
5. Centralize “empty note” detection (shared helper) to keep runtime/test
   semantics aligned.
6. Consider deriving `headKeys` + `selectedKeys` in one pass to avoid divergent
   interpretations from `getContiguousSelectionHeads` vs `getSelectedNotes`.

### Cleanup

1. Remove or justify `selectionIsContiguous` if it has no clear consumer.

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
