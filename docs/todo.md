# TODO

## Centralize environment config access

Introduce a `#config` alias that re-exports a central `config` object (option 1
from the proposed approaches). The module should encapsulate `import.meta.env`
usage and expose fields like `env`, `dev`, and future shared flags so features
can read configuration without touching environment globals directly. This
change should replace the current `dev` flag sourced from the editor config, and
allow us to remove the existing `#config/server` alias by routing all
environment access through the new module.

## Align note indent/outdent helpers with Lexical

1. `isChildrenWrapper` currently requires the wrapper `ListItemNode` to have
   exactly one child, while Lexical’s `isNestedListNode` only checks the first
   child’s type; the stricter check rejects bullets that mix text and nested
   lists.
2. Provide explicit helpers for the current **Outdent** behavior (append the
   subtree directly after the former parent) so editor commands do not need to
   reimplement the tree juggling.
3. `$indentNote`/`$outdentNote` return booleans and throw generic `Error`s,
   whereas Lexical silently no-ops or raises formatted dev invariants; the
   reporting style is inconsistent.
4. `$getOrCreateChildList` omits copying text format and style from the source
   `ListNode`/`ListItemNode`, unlike Lexical, so new wrappers lose typography.
5. The helpers attempt to auto-heal malformed wrappers by removing them instead
   of surfacing invariants like Lexical does.

### Follow-up: In-place Outdent

- Add an optional in-place outdent variant (preserve preorder position) once the
  helper layer above is solid, and document it alongside the existing outdent
  behavior.

## Harden editor schema validator tests

1. Extract shared builders for editor schema fixtures to cut duplication.
2. Add passing fixture for wrapper `ListItemNode`s with valid preceding
   siblings.
3. Add mixed valid/invalid nested list fixture to confirm validator behavior.
4. Reuse editor schema fixtures across other tests that need serialized states.

## Add minifyEditorState round-trip test coverage

Evaluate adding a test that loops through every JSON fixture, runs
`minifyEditorState`, loads the result into Lexical, then re-serializes and
compares to the original data structure.

Options to consider when implementing:

1. Extend the existing `lexicalLoad` harness with a variant that accepts raw
   JSON (no temp files). Pros: reuses the established editor config. Cons:
   requires a small refactor of the helper.
2. Spin up a headless `LexicalEditor` directly inside the test. Pros: minimal
   setup, fast. Cons: must ensure node registrations/config match the main
   editor to avoid false diffs.

## Mouse-driven selection parity

Structural snapping is only covered via keyboard progression today. Add a
follow-up plan to exercise pointer gestures (dragging between notes and
`Shift+Click` expansion) so the SelectionPlugin’s snap + blocking logic stays
consistent once we wire up mouse interactions.

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

## Structural delete regression coverage

Add regression coverage for the stale structural-selection scenario (when a
collaborator deletes the selected notes while the local editor still believes
stage 2 is active).

1. A real collaboration spec under `tests/unit/collab` that spins up two
   editors, has editor A reach stage 2, editor B delete the targeted notes, and
   then checks that pressing Delete on editor A bubbles (no DOM change, caret
   free to act).
2. A faster unit spec beside the existing selection tests that mimics the remote
   delete by running `editor.update` (or the harness helper) to remove the
   structural heads while freezing `structuralSelectionRef`, then asserting the
   same bubbling behavior.

Both variants should prove that Delete/Backspace is only swallowed when an
actual structural removal occurs.

## Container image security lint

Evaluate adding Dockle to scan the built container image (complements Hadolint’s
Dockerfile checks) and decide whether to gate CI on its report.

## Outline helper unit tests

- Add coverage for `list-structure` helpers (content/wrapper detection,
  child-list creation, wrapper cleanup) and `selection-utils` helpers
  (contiguity + selected notes) to lock behaviors.
- Prefer unit tests near the helpers; keep fixtures minimal and mirror current
  tree shapes in `tests/fixtures`.

## Incremental keymap refactor (shortcuts)

1. Make `isApplePlatform` file-local (export only `IS_APPLE_PLATFORM`); adjust
   tests/mocks if needed.
2. Introduce minimal keymap stub for move commands
   (`getDefaultMoveBindingsForPlatform`, `getMoveBindings`,
   `setMoveBindingsForTests`, `getKeyBinding`); add unit tests for defaults and
   overrides.
3. Refactor `ReorderingPlugin` to consume the keymap; update shortcut wiring
   tests to use keymap overrides (no navigator mocking). Keep behavior tests
   unchanged.
4. (Optional) Fold shortcut suite into standard test filters / expand coverage.
