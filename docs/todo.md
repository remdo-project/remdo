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

## Zoom view implementation plan (tests → implementation → review)

1. **Tests (start here):**
   - Add unit tests for zoom state resolution (document root as default; missing
     or invalid zoom target falls back to document root).
   - Add unit tests for breadcrumb model: document-only at root, full ancestor
     path when zoomed, and zoom-root crumb is non-clickable.
   - Add tests for URL sync: zoom target present when zoomed; removed when
     zooming to document root; invalid target ignored.
   - Add interaction tests for bullet-click zooming and breadcrumb navigation
     (choose unit or e2e based on existing harness coverage).
2. **Implementation:**
   - Add zoom state plumbing (defaulting to document root noteId) and keep it
     synced with route state.
   - Render zoomed view by filtering the visible outline to the zoom root
     subtree while preserving relative indentation.
   - Wire bullet click to set zoom target; wire breadcrumb clicks to zoom
     target changes (document root + ancestor notes).
   - Clear breadcrumb path immediately when zoom resets so UI stays in sync
     even without an editor update.
3. **Review & cleanup:**
   - Remove any temporary helpers or debug code; confirm no redundant state or
     duplicate calculations remain.
   - Re-scan for simpler/clearer logic, especially in zoom-to-route syncing and
     subtree filtering.
   - Run lint/tests, then re-check doc alignment and remove any leftover TODOs
     that are no longer needed.

## Outline helper unit tests

- Add coverage for `list-structure` helpers (content/wrapper detection,
  child-list creation, wrapper cleanup) and `selection-utils` helpers (selected
  notes) to lock behaviors.
- Prefer unit tests near the helpers; keep fixtures minimal and mirror current
  tree shapes in `tests/fixtures`.

## Test-only editor props cleanup (proposal)

- Consider moving `Editor` test bridge wiring (`onTestBridgeReady`,
  `onTestBridgeDispose`) into the `editor-props-registry` used by unit tests so
  the app-level `Editor`/`DevPlugin` surface drops test-only props. This would
  keep production props minimal while preserving the test harness hook.

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

  ### Notes

  3. What can be simplified (and what can replace our helpers)

  Below are concrete simplifications and replacements that do not require
  changing your data model:

  ### A) Indentation logic

  Current:
  - src/editor/plugins/IndentationPlugin.tsx handles Tab and calls $indentNote /
    $outdentNote in src/editor/lexical-helpers.ts.

  Potential simplification:
  - Replace $indentNote / $outdentNote with Lexical’s $handleIndent /
    $handleOutdent (from lexical-list/src/formatList.ts).
  - This would give you the same wrapper adjacency model but with Lexical’s
    battle‑tested list mutations, including wrapper merge/creation logic.

  Why this is safe: The vanilla snapshot shows Lexical’s default indent creates
  the same wrapper‑list structure RemDo expects.

  ### B) List structure helpers

  We maintain a set of helpers in src/editor/outline/list-structure.ts. Some can
  be replaced:

  Replaceable by Lexical utils:
  - findNearestListItem → Lexical $findNearestListItemNode.
  - isChildrenWrapper not directly replaceable because Lexical’s
    isNestedListNode is looser (only checks first child is a list). You likely
    want to keep your strict wrapper check to avoid content‑loss in destructive
    operations.

  Potential replacements (if desired):
  - getParentNote or ancestor traversal could use $getTopListNode /
    $getListDepth for robustness.

  ### C) Schema validation using indent

  Right now you validate indent jumps using the serialized indent field:
  - src/editor/plugins/dev/schema/assertEditorSchema.ts
  - src/editor/plugins/dev/schema/traverseSerializedOutline.ts

  Potential simplification:
  - If you rely on Lexical’s registerListStrictIndentTransform (already enabled
    via <ListPlugin hasStrictIndent />), the indent field should already be
    aligned with list depth. That means your custom indent‑jump check is mostly
    redundant, unless you want additional guardrails for corrupted data.

  ———
  4. What can be more robust

  ### A) Use Lexical’s indent/outdent for correctness

  The Lexical list code handles a lot of edge cases (merging wrapper siblings,
  splitting during outdent). It’s likely more robust than our custom $indentNote
  / $outdentNote, and it’s aligned with the shape demonstrated by the vanilla
  snapshot.

  ### B) Keep strict wrapper validation, but use Lexical for traversal

  - Keep isChildrenWrapper strict to avoid silent data loss.
  - Use Lexical utilities where you don’t need strictness, to reduce
    maintenance.

  ### C) Decide whether indent is authoritative or derived

  Right now, indent is read for validation only. Lexical already sets it (see
  snapshots). If you treat it as derived, you can simplify validation to use
  list depth and ignore indent except as a debug hint.

  ———
  5. Recommendation for the Option A vs B decision

  Given the vanilla snapshot and Lexical internals, Option A (wrapper adjacency)
  is already aligned with Lexical’s canonical list shape. That makes Option A
  the low‑risk path:
  - You can replace our indent/outdent logic with Lexical’s.
  - You can rely on Lexical strict‑indent for consistency.
  - You keep your schema invariants and noteId system intact.

  Option B (nested list directly inside content items without wrappers) is still
  a major refactor and doesn’t buy you much, because Lexical already uses the
  wrapper pattern in practice.
