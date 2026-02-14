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
- Rename `createNoteId` to something explicit like `createUniqueNoteId` so the
  uniqueness guarantee is obvious at call sites and tests can avoid defensive
  collision loops.
- Consolidate snapshot-collab test artifacts under a single dedicated temp
  directory (instead of a growing flat file list in
  `tests/unit/collab/snapshot.collab.spec.ts`) and clean that directory in one
  place after each test.

## Test doc-id lifecycle hygiene (deferred)

- We currently mix two strategies in tests:
  random doc IDs (which can leave per-run collab data on disk) and repeatable
  doc IDs (which require explicit pre-test cleanup and add runtime cost).
- Plan a unified test doc-id lifecycle approach so data isolation and cleanup
  are deterministic without ad hoc per-suite behavior.

## Editor

- Consider promoting note-link-local `note-context` into a shared helper that
  resolves content note / noteId from a lexical node (and a thin DOM wrapper),
  then migrate duplicated call sites (`NoteMenuPlugin`, `CheckListPlugin`,
  `NoteControlsPlugin`, `ZoomPlugin`, `note-state`, `note-traversal`) in a
  follow-up refactor.
- Trial Semgrep first (before Sonar) with a narrow rule for the repeated
  `findNearestListItem -> getContentListItem -> isChildrenWrapper` flow and
  verify whether it reliably flags the duplication noted above.
- Plan a unified editor-scoped store (`WeakMap<LexicalEditor, ...>`) and migrate
  existing per-feature stores into it (for example
  `zoom/scroll-target`, `zoom/zoom-change-hints`, `outline/selection/store`,
  `outline/selection/boundary`) with typed keys.
- Consolidate serialized-editor-state traversal into one production helper in
  `lib/editor` and reuse it across persistence/defaults transforms (and tests),
  instead of maintaining separate walkers in each module.
- Expose custom node state fields in the dev tree view (for example `folded`)
  instead of relying mostly on derived display values.
- Plan a wider helper/API refactor around schema assumptions so local editor
  logic becomes much smaller and easier to write: expose strongly typed helpers
  that encode canonical invariants (for example root-first-child-as-list) and
  avoid nullable/defensive flows in normal paths unless a caller explicitly opts
  into tolerant/fallback behavior.
