# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

## Tooling

- Replace the e2e editor test-surface CSS hack in
  `tests/e2e/editor/_support/focus.ts` (`prepareEditorTestSurface`) with a
  route or comparable harness that renders only the editor under test.
- Consolidate repeated unit-test Lexical DOM setup (`document.createElement` +
  `document.body.append` + `createEditor` + `setRootElement`) into a shared
  test helper with a single cleanup path.

## Test doc-id lifecycle hygiene (deferred)

- We currently mix two strategies in tests:
  random doc IDs (which can leave per-run collab data on disk) and repeatable
  doc IDs (which require explicit pre-test cleanup and add runtime cost).
- Plan a unified test doc-id lifecycle approach so data isolation and cleanup
  are deterministic without ad hoc per-suite behavior.

## Editor

- Consolidate serialized-editor-state traversal into one production helper in
  `lib/editor` and reuse it across persistence/defaults transforms (and tests),
  instead of maintaining separate walkers in each module.
- [P1] Prevent rich-text edits before schema readiness —
  `src/editor/Editor.tsx:63-68`
  Keeping `RichTextPlugin` mounted while gating all RemDo behavior behind
  `schemaReady` leaves a window (notably when collaboration hydration is slow)
  where the editor is still editable but core plugins like
  keymap/insertion/deletion/note-id are disabled. In that state, user input is
  handled by Lexical default rich-text behavior, which can create
  non-canonical structure before schema enforcement resumes and lead to
  unexpected normalization/collab results once hydration finishes.
