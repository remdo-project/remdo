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

## Rootless Docker smoke test pipeline

1. Document local rootless Docker setup (dockerd-rootless-setuptool, DOCKER_HOST,
   user service), plus a local build/run flow using `docker/run.sh` or equivalent
   env settings.
2. Define a minimal smoke test (auth-required `GET /health` returning 200) and
   note where to add future integration tests.
3. Add a dedicated GitHub Actions workflow that:
   1. Installs rootless Docker dependencies.
   2. Starts the rootless daemon and validates `docker info`.
   3. Builds the image and runs the container with CI-safe env + data dir.
   4. Runs the smoke test with retries, collecting logs on failure.
   5. Cleans up the container at the end.
4. Note: simplify env tooling across the stack (align `tools/env.sh`, `.env`
   usage, and Docker scripts).

## Env loading simplification

1. Add layered env files for local/dev/test (e.g. `.env.dev`) so Docker test
   runs can share a base `.env` while overriding ports and auth without inline
   flags; replace the temporary TODOs in scripts once supported.
2. Add a prod-side guard that refuses to start if the default/basic auth
   password is still in use.
3. Simplify docker helper setup by centralizing root dir detection inside
   `tools/lib/docker.sh` instead of passing it around.
2. Ensure Docker smoke tests don’t hard-fail when `.env` is missing; solve via
   layered `.env` files so scripts can rely on defaults plus overrides without
   requiring a local private file.
