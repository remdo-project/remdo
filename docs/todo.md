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
- [Optional] Add `csstree-validator` as a strict CSS syntax pass after
  `stylelint` if we want extra parser-level guarantees without style rules.

## Editor

- Explore zoom bullet hover/click robustness without changing visuals. Ideas:
  keep pseudo-element bullets + stronger hit-testing via
  `elementsFromPoint`/`elementFromPoint`, consider an optional invisible per-note
  hit target for pointer handling (or only in tests), and evaluate throttling
  pointermove to reduce work while keeping hover accurate.
- Consolidate `noteHasChildren` into a shared helper. Known ad hoc locations:
  `src/editor/plugins/NoteControlsPlugin.tsx`,
  `src/editor/plugins/FoldingPlugin.tsx`,
  `src/editor/plugins/DeletionPlugin.tsx`. Please do a detailed scan to locate
  any other implementations before refactoring.
- Review `ZOOM_TO_NOTE_COMMAND` payload (`noteId`) in `src/editor/commands.ts`
  and confirm it should use a note key instead.
