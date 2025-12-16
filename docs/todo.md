# TODO

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

## Selection regression coverage (new tests)

## Normalize structural selection helper return shape

Move `getContiguousSelectionHeads` to a single-path API that always returns an
array (empty for collapsed/invalid ranges) and emits optional dev-only telemetry
when invariants fail. Update the helper docstring, Selection/Indent plugins, and
the existing unit tests to expect empty arrays instead of `null` so command
paths stay branch-free while still surfacing anomalies during development.

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

1. Prevent doc reuse across vitest runs: include a per-run nonce in collab test
   doc IDs (or disable collab-server reuse in unit test mode).
2. Add a test-only bridge API for seeding fixtures without polluting undo
   history: apply initial content via a Yjs transaction with a non-tracked
   origin and clear the UndoManager stacks after seeding.
3. Ensure fixture load/clear explicitly resets history so subsequent edits
   produce a single, predictable undo step (unskip the structural delete
   undo/redo unit test once stable).
4. Unskip `tests/unit/deletion.spec.ts` “restores text and structure via
   undo/redo after structural deletion” in collab mode once the above is in
   place, and keep it as a required regression check.

## Container image security lint

Evaluate adding Dockle to scan the built container image (complements Hadolint’s
Dockerfile checks) and decide whether to gate CI on its report.

## Outline helper unit tests

- Add coverage for `list-structure` helpers (content/wrapper detection,
  child-list creation, wrapper cleanup) and `selection-utils` helpers
  (contiguity + selected notes) to lock behaviors.
- Prefer unit tests near the helpers; keep fixtures minimal and mirror current
  tree shapes in `tests/fixtures`.

## Unified Lexical test bridge (window-based)

2. Collab specs now share the remdo bridge; keep provider-mock harnesses only
   for runtime-level tests (awaitSynced/hydration).
3. Consider letting `Editor` accept a `docId` prop that overrides URL parsing
   (tests/stories could set it directly; production would keep URL as default),
   with optional history sync toggle to avoid mutating location in test
   harnesses.
4. Remove any legacy test-only components once the bridge is wired, and note the
   transition in docs so the prior harness doesn’t reappear.

## InsertionPlugin

### Keyboard helper simplification plan

1. Keep `pressKey` a dumb DOM helper: dispatch only `keydown` for a whitelist of
   non-text keys; no Lexical calls or synthetic `beforeinput`/`input`. Add a
   brief docstring on the contract.
2. Defensive throws: if a plain printable character is used, throw “use
   typeText”; throw on `Delete` **and** `Backspace` to avoid silent inline
   edits. Allow other non-text keys (Enter, Tab, arrows, Escape, etc.). Modifier
   combos for selection/navigation (e.g., Ctrl/Cmd+A, Shift+Arrow, plain
   Arrow/Home/End/PageUp/PageDown) remain supported as DOM keydown only. Add
   unit coverage for every supported key/chord unless Lexical’s own helpers
   already guarantee it.
3. Review `typeText` against Lexical’s own test helpers. If Lexical has a
   simpler but equivalent pattern, adopt it; otherwise keep current keydown +
   controlled insertion + synthetic before/input and document the rationale.
4. For unit cases needing non-native behavior (e.g., forward Delete), use a
   small explicit inline-delete helper; do not fold that into `pressKey`.
5. Plan e2e mirrors for such cases using real user actions (Playwright): decide
   on scope (component harness vs full page), seeding strategy, browser targets
   (at least Chromium; consider WebKit/Firefox), and focus/caret helpers to
   reduce flake. Do this as a follow-up task; include forward `Delete` at caret
   as the first mirror so unit-only helpers don’t mask regressions.

6. [P1] Mid-note split still violates docs/insertion.md: falling through to
   Lexical’s default Enter creates a new list item below the current note and
   moves the caret into it, instead of inserting the prefix as a new sibling
   above and keeping the caret in the original note. That means the documented
   middle-of-note behavior (split-above, caret stays on trailing text) is still
   unimplemented. (src/editor/plugins/InsertionPlugin.tsx:79-92)
7. [P1] Start/end detection only checks the anchor text node’s offset. With
   formatted or decorator splits inside a note (multiple text nodes), placing
   the caret at the boundary of a later span yields offset === 0 or offset ===
   textNode.getTextContentSize() even though there is preceding/following text
   in the note. That misclassifies mid- note positions as start/end and triggers
   the wrong insertion path. (src/editor/plugins/InsertionPlugin.tsx:75-90)

## Editor e2e tests

1. Create a tiny base fixture in tests/e2e/\_support/base.test.ts that only
   wires the common pieces you already have (page guards, docId generation,
   bridge helpers). Export { test, expect } from there so non-editor suites keep
   using the generic harness.
2. Build an editor-only fixture layer in
   tests/e2e/editor/\_support/editor.test.ts that extends the base fixture and
   automatically: (a) navigates to /?doc=<id>, (b) calls ensureReady/clear, (c)
   runs prepareEditorTestSurface on every test to hide non-editor chrome, and
   (d) waits for waitForSynced before yielding the editor helper. All editor
   specs import { test, expect } from this file, never from @playwright/test.
3. Move component-specific helpers next to the fixture: put the current
   prepareEditorTestSurface into tests/e2e/editor/\_support/focus.ts, and add a
   withinEditor(page) or editorLocator(page, selector|Locator) helper in
   locator.ts that always scopes to .editor-container. Re-export these from
   editor.test.ts so authors get them “for free.”
4. Keep cross-suite helpers (bridge, fixture loading) in tests/e2e/\_support but
   re-export them selectively from the editor layer to avoid double sources. If
   something is only useful for editor tests (e.g., editor-only fixtures), live
   it under tests/e2e/editor/\_support.
5. Add a small guard to enforce the editor fixture: a
   tests/e2e/editor/.eslintrc.cjs with no-restricted-imports preventing direct
   @playwright/test imports and pointing authors to ./\_support/editor.test.
   This keeps future specs from bypassing the component-focused setup.
6. Document the contract: a short tests/e2e/editor/README.md listing “Always
   import test from \_support/editor.test,” “Locators must go through
   withinEditor/editorLocator,” and “Only editor surface is visible.” This is
   the reminder you wanted inside the folder.
7. (Optional) If you want stricter isolation, add a Playwright project or
   test.use({ baseURL: ... }) override for editor tests that hits a route
   rendering only the Editor shell; until such a route exists, keep the CSS mask
   in focus.ts.
8. Migration path: (a) introduce the base/editor fixture files, (b) switch
   tests/e2e/editor/\*.spec.ts to the new import, (c) move editor-focus.ts under
   the editor folder, (d) drop the old conditional if
   (testInfo.file.includes('/tests/e2e/editor/')) in the base fixture, (e) add
   the ESLint rule and README. No test behavior should change; it just makes the
   editor intent explicit and enforced.

## toMatchOutline improvements (notes + plan)

### Current behavior / pain points

- `toMatchOutline`’s whitespace trimming happens in outline extraction:
  - `readOutline()` (`tests/unit/_support/lib/note.ts`) builds note text via `.join('').trim()`.
  - `getListItemLabel()` (`tests/unit/_support/lib/selection.ts`) also trims (affects selection assertions/labels).
- Trimming blocks expressing edge-space behavior via the primary matcher. For example, `tests/fixtures/edge-spaces.json`
  includes a leading-space note (`" note2-space-left"`) and a trailing-space note (`"note4-space-right "`), but unit tests
  need ad-hoc raw helpers (for example `readNoteTextRaw()` in `tests/unit/deletion.spec.ts`) to assert spacing outcomes.
- There is drift risk: outline-ish logic exists in multiple places with different goals (`readOutline`, `getListItemLabel`,
  and the schema validator’s `collectOutlineEntries()` in `src/editor/schema/assertEditorSchema.ts`, which also trims).

### Goals

1. Make outline assertions whitespace-precise (raw; no trimming) so tests can express the deletion spacing contract
   directly.
2. Reduce helper proliferation by centralizing outline extraction + normalization policy.
3. Enable a shared declarative outline schema and consistent matcher behavior across unit + e2e.

### Proposed direction

1. Define a single outline extraction function that operates on serialized editor state JSON (not the DOM).
2. Unit: have `toMatchOutline` read `remdo.getEditorState()` and compare extracted outline to expected.
3. E2E: fetch editor state JSON via the existing test bridge (`__remdoBridgePromise`) and run the same extraction +
   comparison in the Playwright test runner.
4. Keep HTML assertions only for rendering-specific expectations.

### Confirmed decisions

- Confirmed: `OutlineNode.text` is raw body text (no trims). The matcher does not treat `" "` and `""` as equivalent.
- Note targeting helpers: use find-by-raw-text with “first match in document order” semantics.
- Outline extraction preserves the conceptual note tree and ignores Lexical’s wrapper `ListItemNode`s (they must never
  surface as notes).
- Implement a shared “extract outline from serialized editor state + compare” core, then build thin Vitest/Playwright
  matcher wrappers on top. Keep matcher-behavior tests in Vitest only (fixture-based) since it covers the shared core.

### Next decision

- Confirmed: add an e2e `toMatchOutline` matcher based on Lexical editor state via the test bridge; keep HTML assertions
  as opt-in Playwright expectations when authors want rendering-specific coverage.
- Flake avoidance: the e2e matcher should retry by polling editor state until it matches (or times out), rather than
  requiring every test to call `waitForSynced` before asserting.

### Scope limit (for this plan)

- Implement the new e2e matcher only. Do not migrate existing e2e tests yet; update tests incrementally as follow-up work.

### Follow-ups

- Improve mismatch messages to visualize leading/trailing whitespace clearly (so diffs are readable).
- Simplify outline extraction implementation: build the tree directly from nested lists/wrappers (avoid the flat
  `(text, indent)` pass + stack reconstruction).
- Cleanup naming: consider renaming `extractOutlineFromEditorState` to emphasize it expects serialized state JSON.
- Reduce duplication between `readOutline`, `getListItemLabel`, and `collectOutlineEntries` by routing them through the
  shared extraction/normalization.
- Deduplicate serialized-state traversal helpers with `src/editor/schema/assertEditorSchema.ts` (shared “serialized Lexical
  utils” module), keeping whitespace policy decisions local to each consumer.
- E2E ergonomics: add a Playwright `expect.extend` matcher wrapper around the helper once the API shape settles, and
  migrate any tests that started using the helper to the matcher if we decide the matcher reads better.
- E2E bridge cleanup: de-duplicate `__remdoBridgePromise` plumbing by routing `getEditorState` through the existing
  `runWithRemdoTest`/bridge action mechanism (similar promise lookup logic currently lives in
  `tests/e2e/editor/_support/bridge.ts` and `tests/e2e/editor/_support/fixtures.ts`).
- Cleanup: stop re-exporting outline types/extractors through `#tests` (unit support facade) once call sites can import
  directly from the shared module (currently `#tests-common/outline`).
- Tighten wrapper detection/traversal consistency with Lexical where it matters (related to “Align note indent/outdent
  helpers with Lexical”).

### Open questions

- E2E matcher API shape: `expect.extend` matcher vs an `editor.*` helper (defer until implementation time).
