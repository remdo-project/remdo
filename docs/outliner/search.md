# Search

## Purpose

Define keyboard-first navigation from the search input: current text search
behavior and the planned slash-prefixed navigation flow.

## Terms

- **Search Mode:** active while the search box has focus.
- **Highlighted note:** the single note currently targeted by search navigation.
- **Slash navigation mode:** input mode entered when query starts with `/`;
  intended for quick tree navigation rather than text matching.
- **[Future] Inline completion:** a non-committed ghost suggestion shown inside
  the search input that can be accepted as typed text.

## Behavior

1. Focusing the search box enters Search Mode (including `Cmd/Ctrl+F`).
2. Search Mode shows a flat results list sourced from document notes.
3. Search Mode has exactly one highlighted note when candidates exist.
4. When query text is empty, flat results include all document notes.
5. Typing in the search box filters flat results to notes whose text matches
   the query text (plain text match; no fuzzy matching).
6. `ArrowDown` highlights the next flat result.
7. `ArrowUp` highlights the previous flat result.
8. Arrow navigation stops at the first/last available note (no wraparound).
9. If flat results are empty, there is no highlighted note.
10. Search Mode ends when the search box loses focus.
11. `Enter` moves focus to the editor and zooms to the highlighted note.
12. `Escape` moves focus to the editor.
13. If the query starts with `/`, Search Mode switches to slash navigation
    semantics.
14. In slash navigation, query filtering applies only to the segment after the
    last `/`.
15. In slash navigation, visible query text is the active filter source;
    displayed results must always match that visible segment filter.
16. Slash navigation shows top-level document notes as candidates at the root
    level.
17. In slash navigation, appending another `/` descends into the highlighted
    note and switches candidates to its direct children.
18. In slash navigation, cycling highlighted candidates with arrow keys updates
    the visible input path to the highlighted target path.
19. In slash navigation, pressing `Enter` on exact `/` zooms to document root.
20. In slash navigation with any deeper slash path, pressing `Enter` zooms to
    the highlighted candidate.

## [Future] Inline completion

1. Inline completion appears only while the search input is focused and there is
   a non-empty completion to show.
2. Inline completion is hidden while IME composition is active, when selection
   is non-collapsed, or when caret is not at the end of the input.
3. For an empty query, inline completion is `/`.
4. In slash mode (`/` or `/segment`), the completion source is the first visible
   slash candidate in the current scope.
5. The completion text is only the remaining suffix when the current segment is
   a prefix of that source note text.
6. If the current segment already equals the source note text:
   - show `/` when the source note has children;
   - show no completion when it has no children.
7. `ArrowRight` accepts inline completion by appending only the suggested text
   to the current input; it does not trigger zoom.
8. Inline completion includes a symbolic shortcut hint for acceptance (for
   example `→`), but the hint is metadata, not inserted text.
