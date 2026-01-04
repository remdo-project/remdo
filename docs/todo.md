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

## Note ids in production

Goal: every note (content list item) always has a `noteId`, including newly
created notes and collab insertions.

1. ✅ Done — Document behavior in `docs/outliner/note-ids.md` and link it from
   `docs/outliner/index.md` + `docs/outliner/concepts.md`.
2. ✅ Done — Single source of truth: add a small editor-layer utility for
   `noteId` generation (shared helper). Threading it through every
   note-creation path is tracked in item 3.
3. Audit all note-creation paths (Enter insertions, paste/clipboard import,
   duplication, structural splits/merges, collab insertions, full-document
   duplication) and ensure each creates or preserves `noteId` per the spec.
4. ✅ Done — Added unit tests that paste/duplicate notes and assert fresh
   `noteId` values before implementing any clipboard-specific handling.
5. ✅ Done — Add a normalization pass on load that backfills missing `noteId`
   values and resolves duplicates (preserve first in document order, reassign
   the rest).
6. ✅ Done — Persist normalized IDs on the next save and update schema
   validation to require `noteId` on every content list item.
7. Add collaboration tests to verify deterministic ID preservation across
   clients, including concurrent inserts and copy/paste.
   - ✅ Done — New note ids created locally are preserved on remote clients.
   - ✅ Done — Multiple client inserts yield unique ids and identical outlines.
   - ✅ Done — Concurrent same-location insert (both clients insert at the same
     caret position) keeps ids unique/stable across clients.
   - ✅ Done — Copy/paste coverage across clients (non-conflicting ids preserved).
   - ✅ Done — Conflict coverage for pasted ids colliding with existing notes
     outside the replaced selection (regen and sync deterministically).
   - Add a multi-note structural paste case (nested subtree ids preserved and
     conflicts regenerated consistently across clients).
8. ✅ Done — Updated fixtures and matchers to require `noteId` on all notes.
9. ✅ Done — Removed text/label-based selection helpers; tests now use `noteId`.
10. ✅ Done — Consolidated test-only “get noteId or throw” logic into a shared
    helper to avoid duplication across selection utilities and matchers.
11. ✅ Done — kept `toMatchSelection` and removed `toMatchSelectionIds` (call
    sites now use explicit structural snapshots).
12. ✅ Done — Added a `toMatchOutline` escape hatch (`noteId: null`) to assert
    presence of a noteId without pinning its exact value in tests.
13. ✅ Done — dropped unused path helpers; revisit only if a new id-based helper is needed:
    options discussed were a variadic index helper (`noteIdAt(outline, 0, 1)`),
    explicit naming (`getNoteIdAtIndexPath`), or an id-path helper that accepts
    a sequence of noteIds (e.g., `getNoteAtIdPath(outline, id1, id2)`).
14. ✅ Done — Added a test-only, single-load bypass so invalid serialized states
    can be loaded without `assertEditorSchema` throwing, enabling NoteIdPlugin
    load-normalization tests.
15. ✅ Done — Added load-normalization unit tests for missing and duplicate
    `noteId` values.
16. Add E2E tests for clipboard move semantics (structural cut/paste preserves
    `noteId`, including replace-in-place and paste-elsewhere flows).
    - Blocked: native `Cut` does not act on structural selection in E2E, so the
      tests are misleading until we fix structural cut behavior (or expose a
      test bridge command that exercises it).
17. ✅ Done — Cross-document paste follows the same preserve-unless-conflict
    rule as any clipboard payload; current clipboard tests cover this, so no
    doc-switch-specific tests are planned for now.
18. ✅ Done — Clarified copy/edit/paste semantics when clipboard noteIds match a
    structural selection (single vs. multi-note, reorder cases, and conflict
    handling).
19. ✅ Done — Add clipboard tests for missing `noteId` payloads (assign fresh
    ids, include nested notes).
20. ✅ Done — Add clipboard tests for multi-note structural selections
    (including nested children) to ensure replaced subtree ids are excluded
    from conflicts and new ids remain unique.
21. ✅ Done — Add clipboard tests for inline range selections spanning multiple
    notes (non-structural) to confirm we derive heads correctly and preserve
    ids for replaced notes only.
22. ✅ Done — Add clipboard tests for duplicate noteIds across parent/child
    nodes to confirm the first occurrence wins across the entire subtree.
23. ✅ Done — Add clipboard tests for payloads containing `noteId === docId` to
    ensure they regenerate.

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
