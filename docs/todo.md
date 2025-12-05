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

## Mouse-driven selection parity

Structural snapping is only covered via keyboard progression today. Add a
follow-up plan to exercise pointer gestures (dragging between notes and
`Shift+Click` expansion) so the SelectionPlugin’s snap + blocking logic stays
consistent once we wire up mouse interactions.

## Normalize structural selection helper return shape

Move `getContiguousSelectionHeads` to a single-path API that always returns an
array (empty for collapsed/invalid ranges) and emits optional dev-only
telemetry when invariants fail. Update the helper docstring, Selection/Indent
plugins, and the existing unit tests to expect empty arrays instead of `null`
so command paths stay branch-free while still surfacing anomalies during
development.

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

## Wire Playwright E2E harness

1. Tighten Vitest test globs to `tests/unit/**/*.spec.{ts,tsx}` so e2e specs live
   outside the unit suite.
2. Add Playwright deps/scripts: `@playwright/test`, `pnpm run test:e2e`
   (collab enabled by default), and `pnpm exec playwright install --with-deps chromium`.
3. Create `playwright.config.ts` that pulls `config.env` for `baseURL`, scopes to
   `tests/e2e`, retries on CI, enables trace/video on failure, and uses HTML
   locally + dot/JSON reporters on CI.
4. Provide a webServer helper (e.g., `tools/e2e-server.ts`) that starts the app
   and reuses `ensureCollabServer`, suitable for Playwright’s `webServer` hook.
5. Add shared fixtures to fail on console warn/error and to wait for the app
   shell to be ready before tests proceed.
6. Land a smoke spec that renders the editor, creates notes, indents/outdents,
   and asserts no console errors or 4xx/5xx responses.
7. Add a CI workflow (`playwright.yml`) that installs browsers, builds the app,
   runs `pnpm run test:e2e`, and caches `~/.cache/ms-playwright` with explicit
   HOST/PORT/COLLAB envs.
8. Document local e2e instructions in `docs/contributing.md` (or a new
   `docs/testing.md`) and reflect the doc change in AGENTS.md. Default lane is
   `pnpm run test:e2e` (collab enabled via env); set `COLLAB_ENABLED=false`
   temporarily when you need a non-collab run.

### (NEW) Incremental redo plan for unified test bridge

1. Vitest setup uses the bridge directly: in unit setup expose `remdo` and set
   `remdo.load = (name) => remdo.applySerializedState(readFixture(name))`; drop
   extra helper casting; update Vitest context types. Run `pnpm run test:unit`.
2. Rename `lexical`→`remdo` in unit specs/helpers, removing the old helper
   indirection files. Run `pnpm run test:unit`.
3. Align fixtures per spec (flat/basic/tree/tree_complex) without changing
   logic; rerun `pnpm run test:unit`.
4. If outlines differ, adjust only fixture choice or expected outlines (no
   command logic). Run `pnpm run test:unit` and `pnpm run test:unit:collab`.
5. Playwright smoke: rename `loadFixture`→`load` to match the bridge; optional
   `pnpm run test:e2e`.

## Unified Lexical test bridge (window-based)

1. Add a dev-only `TestBridgePlugin` inside `DevPlugin` that registers a
   `window.remdoTest` API (load/replaceDocument, mutate, validate,
   getEditorState, dispatchCommand, clear, waitForSynced, getCollabDocId)
   using the commit-wait + awaitSynced semantics from the unit helpers.
2. Extract the existing unit `createLexicalTestHelpers` logic to a shared
   module (e.g., `tests/shared/editor-helpers.ts`) so both Vitest and
   Playwright reuse identical behaviors and tagging rules.
3. Refactor `tests/unit/_support/setup/_internal/lexical/hooks.tsx` to consume
   the shared helpers and drop the ad hoc Bridge component; keep the doc-id
   per-worker logic but centralize it alongside the helpers.
4. Introduce a Playwright helper (`tests/e2e/_support/bridge.ts`) that reads
   fixtures from disk in Node and calls `page.evaluate` to invoke
   `window.remdoTest.load`/`waitForSynced`, staying window-only on the browser
   side (no DOM driver element).
5. Replace bespoke collab test harnesses (e.g., in `tests/unit/collab/*`) with
   the shared API where feasible so all test suites rely on the same bridge and
   synchronization semantics.
6. Remove any legacy test-only components once the bridge is wired, and note
   the new API location in AGENTS.md.
7. Flatten fixtures to store the serialized editor state directly (no
   `editorState` wrapper) so the bridge can parse once and feed it to
   `parseEditorState` without unwrapping.
8. Do a follow-up cleanup pass on `src/editor/plugins/TestBridgePlugin.tsx`
   once fixtures are flattened to strip remaining helper plumbing and keep the
   API surface minimal.
9. Still needed: have Vitest and Playwright consume the bridge directly without
   extra helper remapping, and ensure both suites load the same raw JSON fixture
   shape so a single API surface covers all editor tests.
