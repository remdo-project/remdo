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

## Cut-as-move

- Implement cut-as-move behavior in prod (cut marks notes; paste moves them).
- [P1] Cut paste at a caret duplicates notes: move path uses target selection
  heads, so an empty structural selection skips removal and leaves the cut
  subtree in place. Ensure caret pastes still remove the marked notes so cut
  behaves like a move.
- [P2] Structural cut currently returns true without touching the clipboard.
  That blocks the RichTextPlugin cut handler, so cross-app cut/paste never
  updates the system clipboard. Confirm whether cut should serialize to the
  clipboard; if yes, wire in Lexical’s normal cut flow.
- [P2] Non-collapsed text selection inside a single note is treated as a
  structural cut (contiguous selection heads). This hijacks normal text cut
  behavior and removes whole notes instead of the selected text. Decide if
  partial-text cuts should be handled by Lexical and guard accordingly.
- [P2] Caret paste can move cut nodes into their own subtree: the intersection
  guard only checks structural selection heads, so collapsed caret pastes skip
  the self-move check. Validate the caret’s nearest list item against the cut
  marker.
- Revisit test helpers once cut-as-move is fully implemented; `cutStructuralNoteById`
  in `tests/unit/_support/lib/clipboard.ts` is a stopgap that should be replaced
  by the real cut flow.
- Note: current move logic uses stored head keys (not clipboard payload) to
  identify the cut subtree; if the cut implementation changes, update tests and
  helper assumptions accordingly.

## Collab schema normalization plan (wrapper/list races)

Goal: keep outline structure valid under concurrent list moves (indent/outdent,
reorder) by normalizing wrapper list items before schema validation.

1. Define normalization rules for wrappers: wrapper must have exactly one
   nested list; merge multiple nested lists (preserve document order); wrapper
   must follow a content list item; orphan wrappers attach to the nearest prior
   content item at the same level or lift their items into the parent list.
2. Add a normalization helper at the Lexical adapter boundary and run it on
   collab update ingestion plus paste/import paths before validation (dev/test
   always; prod with logging/telemetry).
3. Add regression fixtures from real data (main-bug + wrapper-race snapshots)
   and assert normalization yields a valid outline with preserved order.
4. Add deterministic collab race tests: indent vs indent on same note, indent
   vs outdent, reorder vs indent, delete vs indent, multi-select indent; all
   should normalize to a valid tree.
5. Add clipboard/import roundtrip tests to confirm HTML and JSON paths either
   carry or normalize the issue in a controlled way.
6. Add a seeded fuzz harness for concurrent ops (opt-in for test:dev) that
   replays failing seeds and asserts normalization + invariants.
7. Log/track normalization hits so we can detect frequency in prod and decide
   if upstream fixes or tighter guards are needed.
