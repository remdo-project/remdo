# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

## Harden editor schema validator tests

1. Extract shared builders for editor schema fixtures to cut duplication.
2. Add passing fixture for wrapper `ListItemNode`s with valid preceding
   siblings.
3. Add mixed valid/invalid nested list fixture to confirm validator behavior.
4. Reuse editor schema fixtures across other tests that need serialized states.

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

## Test infra

- E2E runs reuse persisted collab docs (e.g.,
  `data/collab/project/data.ysweet`), so failures can disappear after a run
  normalizes data. Add a cleanup or per-run `DATA_DIR`/doc-id strategy so
  Playwright runs are isolated and deterministic.

## Other

- Follow-up: paste placement at end-of-note with children currently inserts
  after the entire subtree (next content sibling), which feels unintuitive when
  the caret sits visually above the first child. Align paste insertion with
  `docs/insertion.md` end-of-note semantics so pastes land as the first child,
  and add a focused test to lock this behavior.

## Prod doc corruption: schema recovery plan (discussion)

Context from prod data snapshot (`data/project.json`):

- Content list items are missing `noteId` fields, triggering schema validation
  failures on load.
- There is an orphan wrapper list item (a wrapper list item whose nested list
  has no preceding content sibling), which makes the "selection" note the first
  child in its list and causes move-up to be a no-op.
- One content list item has no children at all (no text node).

Plan (proposed, Lexical-style healing; for discussion before implementation):

1. Document-level model alignment (define the model first):
   - ✅ Done: Treat the document root as a special note; update docs to state
     that every note has a parent except the document root.
   - ✅ Done: Clarify indentation semantics in the spec:
     - RemDo allows exactly one indentation level between a parent note and its
       children.
     - Lexical adapter uses two mechanisms: wrapper adjacency + `indent` field.
     - Define how these relate and which one is authoritative.
   - Alternatives (needs decision before deeper refactors):
     - Option A (keep wrapper adjacency as authoritative): disable Lexical
       `hasStrictIndent` and keep using our wrapper-based indent/outdent +
       schema validation. Pros: minimal change, matches current schema. Cons:
       no Lexical strict-indent auto-fixes.
     - Option B (align fully with Lexical canonical lists): drop wrapper
       adjacency and allow nested lists as children of content list items.
       Pros: strict-indent + list transforms become native Lexical flows.
       Cons: large refactor (selection/indent/delete/normalization/note-id
       traversal/fixtures).
2. Unify normalization into a single plugin:
   - Replace/merge RootSchemaPlugin + future wrapper repair into an
     `OutlineNormalizationPlugin`.
   - Superseded: we simplified to a root-only normalization check in
     `RootSchemaPlugin` (no list/listitem transforms). This keeps behavior
     predictable and avoids transform re-entrancy; revisit only if we need
     better perf on huge docs.
3. Localized normalization via node transforms:
   - Superseded by root-only normalization (see item 2). No localized list
     transforms in the current approach.
4. One-time load repair (explicit post-load update):
   - ✅ Done: After collab hydration or snapshot load, run a repair update that:
     - Calls the existing `$normalizeNoteIdsOnLoad` (NoteIdPlugin/TestBridge).
     - Runs root-list normalization (RootSchemaPlugin/normalizeRootOnce).
   - Uses `markSchemaValidationSkipOnce` for repair updates before persisting.
5. Decision point: `noteId` normalization scope:
   - ✅ Done: missing ids are fixed on load without global scans.
   - ✅ Done: duplicates are repaired on load (preserve first, regen rest) and
     report invariants.
6. Decision point: orphan wrapper repair policy (root vs non-root cases):
   - ✅ Done: Root-level orphan (no preceding content sibling) hoists children
     into the root list.
   - ✅ Done: Orphan after a valid wrapper merges into the previous wrapper to
     preserve depth.
   - Add a note to brainstorm other invalid shapes and define deterministic
     normalization outcomes + fixtures for each.
7. Tests and fixtures:
   - ✅ Done: Add `editor-schema/wrapper-orphan.json` (wrapper at list start) and
     `editor-schema/wrapper-orphan-after-wrapper.json` (prod-like orphan after a
     valid wrapper) as focused normalization fixtures.
   - ✅ Done: Add a test that runs normalization and verifies correct move-up
     behavior.
   - ✅ Done: Reintroduce a softer collab orphan-wrapper check (asserts schema
     validity after sync without pinning a precise outline).
   - ✅ Done: Reuse existing missing/duplicate `noteId` fixtures for note-id
     repairs.
   - Every normalization scenario must have a dedicated test case.
8. Unified issue reporting (simplest + robust; no backward-compat constraints):
   - Keep a single reporting entry point (currently `reportInvariant`) and
     remove env-based throwing; all environments log/report issues only.
   - Tests enforce strictness via console expectations (unit/e2e/collab
     harnesses fail on unexpected console errors).
   - Schema validation uses one non-throwing flow that can report issues we
     don't fix yet (e.g. duplicate noteId detected on load).
   - Run a load-time schema scan in report mode for all envs; rely on test
     harnesses (not thrown exceptions) to flag unexpected issues.
   - UI indicator is optional; decide later if we want a warning badge near the
     collab status or just telemetry/logs.
9. Root-cause investigation:
   - ✅ Done: Add dev-only logging to capture the first update that introduces
     a wrapper without a preceding sibling (tags + serialized outline snapshot).
   - ✅ Done: Reproduce with multi-client collab tests (see
     `tests/unit/collab/outline-normalization.collab.spec.tsx`).
10. Post-normalization simplification review:

- Once normalization is in place, review selection and structural code for
  simplification opportunities (selection helpers/tests are likely candidates,
  but not the only ones).
- Then make sure that validation and normalization cover all known invalid states
  so we can remove defensive code elsewhere. Also make sure that both are well structured
  and decoupled from other logic for maintainability.
- TODO: Drop the defensive `root.type !== "root"` early return in
  `traverseSerializedOutline` once we confirm all call sites always pass a real
  `SerializedEditorState`. Re-check the exact use cases and decide whether this
  traversal should be unified with another validation/normalization flow so the
  guard is unnecessary.
