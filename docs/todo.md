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

## Doc IDs / names (deferred)

- Define and enforce a route-safe `docId`/`noteId` contract so note-ref parsing
  can stay trivial (`docId_noteId`) without URL-coupled encoding logic; until
  doc IDs are auto-generated, keep a no-underscore constraint for manual IDs.
- Clarify and separate `docId` (identifier) vs document name/label terminology
  across docs/code/tests as part of the broader deferred doc identity effort.

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
- Expose custom node state fields in the dev tree view (for example `folded`)
  instead of relying mostly on derived display values.
- Reconsider link-state boundaries and decide what should remain persisted as
  link state versus derived from routing/editor state.
- Plan a wider helper/API refactor around schema assumptions so local editor
  logic becomes much smaller and easier to write: expose strongly typed helpers
  that encode canonical invariants (for example root-first-child-as-list) and
  avoid nullable/defensive flows in normal paths unless a caller explicitly opts
  into tolerant/fallback behavior.

## Internal links: drop persisted URL/cache (deferred)

Goal:

- Make internal-link canonical state be only `noteId` + optional `docId`
  (same-doc links omit `docId`), and derive route URL on demand.
- Remove persisted/cached internal-link `url` and remove doc-wide sync passes
  that currently rewrite link URLs when doc context changes.
- Keep the design environment-agnostic: browser/CLI/snapshot should inject doc
  context via clean boundaries, not via `location` reads inside core link logic.
- No legacy-data compatibility work is planned for this effort.

Known so far:

- URL is derivable from link identity + current doc id; storing URL is redundant
  in principle.
- Current implementation still relies on `LinkNode.__url` behavior, so we
  currently do full-document URL sync in browser and snapshot paths.
- Same-doc identity rule is already in place (`docId` omitted for same-doc
  links), and cross-doc links keep explicit `docId`.
- `getURL()`/node methods rely on active Lexical state; this is valid in
  current call paths (DOM updates, editor-state export, read/update callbacks),
  but they cannot assume an active editor object in every path.

Still to confirm before implementation:

- Best source for current doc id during URL derivation (for example root/editor
  state field) that works in browser and non-browser runtimes without ad hoc
  globals.
- Whether internal links should continue extending `LinkNode` as-is, or move to
  a custom node contract that does not require persisted `__url`.
- How to guarantee href updates on doc switch/load without doc-wide link walks.
- Exact serialization contract after dropping URL fields, and which fixtures/
  adapter expectations need to change.
- Whether any call paths invoke URL resolution outside valid Lexical state
  boundaries once the cache is removed.
