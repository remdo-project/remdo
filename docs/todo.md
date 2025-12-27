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

## OutlineSelection + dataset removal (refactor plan)

### Goals

- Replace brittle DOM dataset reads with a programmatic `OutlineSelection` API.
- Keep the selection contract aligned with `docs/outliner/selection.md`.
- Reduce SelectionPlugin complexity by consolidating helpers and state.

### Plan (incremental refactor)

1. **Introduce OutlineSelection model + store**
   - New module `src/editor/outline/outline-selection.ts` with a single source-of-truth type:
     - `kind: 'caret' | 'inline' | 'structural'`
     - `stage` (progressive ladder stage)
     - `anchorKey` / `focusKey` (content list item keys)
     - `headKeys` (structural heads, document order)
     - `range` (`caretStartKey`, `caretEndKey`, `visualStartKey`, `visualEndKey`)
     - `isBackward`
   - Store with `WeakMap<LexicalEditor, OutlineSelection>`.
   - Expose per-instance helpers `editor.getOutlineSelection()` /
     `editor.setOutlineSelection(next)` that read/write the WeakMap (no
     EditorState coupling, no prototype patching).

2. **Consolidate selection/tree helpers**
   - Reorganize selection code into clear layers (new folder), with minimal APIs:
     - `src/editor/outline/selection/model.ts`: `OutlineSelection` types only.
     - `src/editor/outline/selection/store.ts`: WeakMap store + `installOutlineSelectionHelpers`.
     - `src/editor/outline/selection/tree.ts`: structure-only helpers (parents, siblings, subtree tails, ordering).
     - `src/editor/outline/selection/resolve.ts`: derive `OutlineSelection` from Lexical `RangeSelection`.
     - `src/editor/outline/selection/apply.ts`: apply `OutlineSelection` → Lexical selection.
     - `src/editor/outline/selection/heads.ts`: `getContiguousSelectionHeads` (selection semantics).
     - `src/editor/outline/selection/index.ts`: minimal exports for consumers.
   - Keep exports narrow (the rest of the app should only need
     `editor.getOutlineSelection()` + `getContiguousSelectionHeads`).
   - Move duplicated helpers from `SelectionPlugin.tsx` and
     `structural-selection.ts` into a shared module (either reuse
     `selection-utils.ts` or create `selection-helpers.ts`).
   - Consolidate: `normalizeContentRange`, `getContentDepth`,
     `getParentContentItem`, `getContentSiblings`, `getNext/PreviousContentSibling`,
     `getSubtreeTail`, `compareDocumentOrder`, `sortHeadsByDocumentOrder`.
   - Keep `getContiguousSelectionHeads` as a pure helper with no DOM access.

3. **Refactor SelectionPlugin to use OutlineSelection**
   - Derive `OutlineSelection` from Lexical selection in the update listener,
     then store it (no more `structuralSelectionKeysRef`).
   - Swap the structural highlight toggle from `data-structural-selection` to a
     CSS class (e.g. `.editor-input--structural`) so DOM is styling-only and
     logic stays in the OutlineSelection store.
   - Keep structural highlight metrics (CSS variables), but **stop writing**
     `data-structural-selection-keys`.
   - Progressive ladder + directional logic should update OutlineSelection,
     then apply Lexical selection from it.
   - Strip non-selection responsibilities out of SelectionPlugin (structural
     delete behavior, caret resolution after deletion, and action-specific key
     handling). Deletion/indent/reorder plugins should consume
     `editor.getOutlineSelection()` instead of re-deriving selection or touching
     DOM internals.

4. **Update test utilities**
   - In `tests/unit/_support/setup/_internal/assertions/matchers.ts`, replace
     dataset fallback with `remdo.editor.getOutlineSelection()` and map
     `headKeys` to labels.
   - Update selection tests that read `rootElement.dataset.structuralSelectionKeys`
     to use `getOutlineSelection()` directly.
   - Address currently `it.fails` cases in `tests/unit/selection.spec.ts` and the
     failing structural delete case in `tests/unit/deletion.spec.ts` by fixing
     selection/structural delete behavior as part of the refactor (empty notes,
     ladder progression, and caret collapse should match the contract).
   - Add a focused unit test that toggles structural selection on/off and
     asserts the CSS class is applied/removed (caret → structural → caret),
     keeping DOM coverage minimal.
   - Added: Playwright E2E check that verifies the structural highlight appears
     when structural selection is active (`tests/e2e/editor/selection.spec.ts`).
   - Resolved: use a single `editor.selection` namespace (`get`/`set`/`heads`/
     `isStructural`) instead of adding more top-level editor helpers.

### Optional clean-slate redesign (if we want to rewrite)

- Add a `SelectionStateMachine` module that owns the ladder transitions and
  returns `OutlineSelection` for actions (`selectAll`, `extendUp`, `extendDown`,
  `collapseToCaret`, `pointerSnap`).
- Make Lexical selections derived from `OutlineSelection` (except pointer
  changes), allowing element-based selection for empty notes.
- Keep SelectionPlugin as an orchestrator: translate events → state machine →
  apply selection → store OutlineSelection.

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
