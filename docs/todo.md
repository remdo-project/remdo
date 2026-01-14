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
- Missing coverage: add a normalization test that loads a document containing a
  wrapper list item whose nested list has no list-item children (an empty child
  list), runs the load-time normalization pass, and asserts the invalid wrapper
  is removed so the resulting outline is schema-valid and stable. The test
  should also ensure the remaining notes keep their note ids and order intact
  after the cleanup.

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
2. Unify normalization into a single plugin:
   - Replace/merge RootSchemaPlugin + future wrapper repair into an
     `OutlineNormalizationPlugin`.
   - Use a `ListNode` transform (Lexical-style) so repairs only run on dirty
     list subtrees.
   - Keep root-list enforcement (single root list) in the same plugin, but do
     it via a `RootNode` transform or explicit root pass so the root list is
     still created even when no lists exist yet.
3. Localized normalization via node transforms:
   - For each dirty list subtree, normalize siblings in a single pass:
     - Repair orphan wrappers (policy decision below).
     - Ensure wrapper list items contain exactly one list child and no content.
     - If a wrapper's nested list has no list-item children, drop the wrapper
       and list (invalid wrapper shape).
     - Ensure content list items have at least one TextNode (insert empty text
       node if missing) and treat this as the canonical empty note shape.
4. One-time load repair (explicit post-load update):
   - After collab hydration or snapshot load, run a single update that:
     - Calls the existing `$normalizeNoteIdsOnLoad` (see decision below).
     - Runs the root-list normalization helper (same code path as the
       transform) so a newly loaded doc is repaired immediately.
   - Use `markSchemaValidationSkipOnce` for the repair update, then persist the
     repaired state on next save.
5. Decision point: `noteId` normalization scope:
   - `noteId` generation is local/random and assumed unique; missing ids can be
     fixed without any global scan.
   - Duplicates may still appear due to merges/corruption; repair them on load
     (preserve the first occurrence, assign fresh ids to the rest) and also
     emit an invariant report so we can track the issue.
6. Decision point: orphan wrapper repair policy (root vs non-root cases):
   - Root-level orphan (no preceding content sibling): drop the wrapper and
     hoist its children to the root list (single indent level).
   - Orphan after a valid wrapper: merge the orphan’s nested list into the
     previous content item’s wrapper to preserve intended depth (prod-like
     case).
   - Add a note to brainstorm other invalid shapes and define deterministic
     normalization outcomes + fixtures for each.
7. Tests and fixtures:
   - ✅ Done: Add `editor-schema/wrapper-orphan.json` (wrapper at list start) and
     `editor-schema/wrapper-orphan-after-wrapper.json` (prod-like orphan after a
     valid wrapper) as focused normalization fixtures.
   - Reuse `editor-schema/list-wrapper-no-listitem.json` to cover empty child
     list normalization.
   - Add a test that runs normalization and verifies schema validity plus
     correct move-up behavior.
   - Reuse existing missing/duplicate `noteId` fixtures for note-id repairs.
   - Every normalization scenario must have a dedicated test case.
8. Recurrence prevention + feedback loop:
   - Keep the transform-based normalization always on (repairs local changes).
   - Align prod/dev/test invariant behavior:
     - Make `reportInvariant` environment-agnostic (always log + report, never
       throw).
     - Tests enforce strictness by asserting reported invariants; add a way to
       mark expected invariants for tests that cover known bad inputs (similar
       to `schemaValidationSkipOnce`).
     - Update schema/unit tests that currently expect throws to use the
       reporter-based assertions (or add a test-only helper that throws).
   - Unified feedback (all envs):
     - log to console on every normalization repair
     - show a small yellow warning icon next to the collab status indicator
       (tooltip: "Data repaired; check console").
     - only show the warning once per session/doc until cleared, to avoid
       spamming the UI for repeated repairs.
     - keep a rolling counter of repairs in memory so tests can assert on it.
9. Root-cause investigation:
   - Add dev-only logging to capture the first update that introduces a wrapper
     without a preceding sibling (command name + serialized outline snapshot).
   - Reproduce with multi-client collab tests to see if Yjs merges can leave
     wrappers orphaned.
10. Post-normalization simplification review:

- Once normalization is in place, review selection and structural code for
  simplification opportunities (selection helpers/tests are likely candidates,
  but not the only ones).
