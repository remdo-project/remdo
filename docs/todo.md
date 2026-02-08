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

## Editor

- Review `ZOOM_TO_NOTE_COMMAND` payload (`noteId`) in `src/editor/commands.ts`
  and confirm it should use a note key instead.
