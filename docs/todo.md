# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

## Tooling

- Keep `@typescript-eslint/utils` explicitly listed in dev deps for
  `eslint-plugin-antfu` runtime imports. Drop it once the upgraded plugin
  properly declares the dependency.
- Replace the e2e editor test-surface CSS hack in
  `tests/e2e/editor/_support/focus.ts` (`prepareEditorTestSurface`) with a
  route or comparable harness that renders only the editor under test.

## Editor

- Review `ZOOM_TO_NOTE_COMMAND` payload (`noteId`) in `src/editor/commands.ts`
  and confirm it should use a note key instead.
- Consider promoting note-link-local `note-context` into a shared helper that
  resolves content note / noteId from a lexical node (and a thin DOM wrapper),
  then migrate duplicated call sites (`NoteMenuPlugin`, `CheckListPlugin`,
  `NoteControlsPlugin`, `ZoomPlugin`, `note-state`, `note-traversal`) in a
  follow-up refactor.
- Trial Semgrep first (before Sonar) with a narrow rule for the repeated
  `findNearestListItem -> getContentListItem -> isChildrenWrapper` flow and
  verify whether it reliably flags the duplication noted above.
- Consider extracting link-local note DFS traversal (`$visitList` in
  `src/editor/links/note-link-index.ts`) into a shared outline traversal helper
  used by links and existing note-tree scans (for example `note-traversal`).
- Reconsider link-state boundaries and decide what should remain persisted as
  link state versus derived from routing/editor state.
- Define and enforce a route-safe `docId`/`noteId` contract so note-ref parsing
  can stay trivial (`docId_noteId`) without URL-coupled encoding logic; until
  doc IDs are auto-generated, keep a no-underscore constraint for manual IDs.
- Plan a wider helper/API refactor around schema assumptions so local editor
  logic becomes much smaller and easier to write: expose strongly typed helpers
  that encode canonical invariants (for example root-first-child-as-list) and
  avoid nullable/defensive flows in normal paths unless a caller explicitly opts
  into tolerant/fallback behavior.
- ✅ Done: Make real pointer clicks on inline links reliably reach the anchor
  (no synthetic dispatch workaround), then simplify
  `tests/e2e/editor/links.spec.ts` ("clicking a note link navigates to zoom
  target") to plain `await link.click()` and align
  `tests/unit/links.spec.ts` ("clicking a link zooms to its target note") to
  use plain `linkElement.click()` as well.
