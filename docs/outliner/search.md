# Search

## Purpose

Define how search works from the user point of view.

## Terms

- **Search Mode:** active while the search box has focus.
- **Highlighted note:** the single note currently targeted by search navigation.

## Behavior

1. Focusing the search box enters Search Mode (including `Cmd/Ctrl+F`).
2. Entering Search Mode keeps the current view as-is and highlights the first
   note visible at the top of that view.
3. Search Mode has exactly one highlighted note when candidates exist.
4. `ArrowDown` highlights the next visible note.
5. `ArrowUp` highlights the previous visible note.
6. Folded children are skipped while navigating.
7. Arrow navigation stops at the first/last available note (no wraparound).
8. Typing in the search box switches the list to a flat results view.
9. Flat results show only notes whose text matches the query text (plain text
   match; no fuzzy matching).
10. In flat results, `ArrowUp` and `ArrowDown` move the highlight through
    results the same way.
11. If flat results are empty, there is no highlighted note.
12. Search Mode ends when the search box loses focus.
13. `Enter` moves focus to the editor and zooms to the highlighted note.
14. `Escape` moves focus to the editor.
