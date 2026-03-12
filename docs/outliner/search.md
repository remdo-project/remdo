# Search

## Purpose

Define keyboard-first navigation from the search input: current text search
behavior and the planned slash-prefixed navigation flow.

## Terms

- **Search Mode:** active while the search box has focus.
- **Highlighted note:** the single note currently targeted by search navigation.
- **Slash navigation mode:** input mode entered when query starts with `/`;
  intended for quick tree navigation rather than text matching.
- **Inline completion:** a non-committed ghost suggestion shown inside
  the search input that can be accepted as typed text.

## Behavior

1. Focusing the search box enters Search Mode (including `Cmd/Ctrl+F`).
2. Search Mode shows a flat results list sourced from document notes.
3. Search results and empty states appear only after the active document's
   search candidates are available.
4. Search Mode has exactly one highlighted note when candidates exist.
5. When query text is empty, flat results include all document notes.
6. Typing in the search box filters flat results to notes whose text matches
   the query text (plain text match; no fuzzy matching).
7. `ArrowDown` highlights the next flat result.
8. `ArrowUp` highlights the previous flat result.
9. Arrow navigation stops at the first/last available note (no wraparound).
10. If flat results are empty, there is no highlighted note.
11. Search Mode ends when the search box loses focus.
12. `Enter` moves focus to the editor and zooms to the highlighted note.
13. `Escape` moves focus to the editor.
14. If the query starts with `/`, Search Mode switches to slash navigation
    semantics.
15. In slash navigation, query filtering applies only to the segment after the
    last `/`.
16. In slash navigation, visible query text is the active filter source;
    displayed results must always match that visible segment filter.
17. Slash navigation shows top-level document notes as candidates at the root
    level.
18. In slash navigation, appending another `/` descends into the highlighted
    note and switches candidates to its direct children.
19. In slash navigation, cycling highlighted candidates with arrow keys updates
    only highlight; it does not mutate visible query text.
20. In slash navigation, pressing `Enter` on exact `/` zooms to document root.
21. In slash navigation with any deeper slash path, pressing `Enter` zooms to
    the highlighted candidate.
22. Invalid completed slash paths (for example `/missing/` or
    `/parent/missing/`) show no matches and must not fall back to ancestor or
    root candidates.
23. Inline completion appears only while search input is focused and completion
    text is non-empty.
24. Inline completion is hidden while IME composition is active, when selection
    is non-collapsed, or when caret is not at input end.
25. While Search Mode is active, the static `Search` placeholder is hidden to
    avoid visual overlap with inline completion.
26. For empty query, inline completion text is `/`.
27. For non-empty non-slash query text, inline completion is hidden.
28. In slash mode, inline completion source candidate is highlighted candidate
    when present, otherwise first visible slash candidate.
29. In slash mode, if current segment is a prefix of source note text, inline
    completion text is the remaining suffix.
30. In slash mode, if current segment exactly matches source note text:
    - inline completion is `/` when source note has children;
    - inline completion is hidden when source note has no children.
31. `ArrowRight` accepts inline completion by appending only suggested text to
    current input and does not trigger zoom.
32. Inline completion may display symbolic shortcut hint metadata (for example
    `→`), but hint is not inserted text.
33. Search input exposes combobox semantics for assistive tech, including popup
    state and active descendant linkage.
34. Search results expose listbox semantics and mark the highlighted result as
    selected.
35. In flat results, non-leaf notes show a muted `/...` suffix hint; leaf notes
    show no suffix.
