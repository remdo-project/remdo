# Search

## Purpose

Define keyboard-first navigation from the search input: current text search
behavior and the planned slash-prefixed navigation flow.

## Terms

- **Search Mode:** active while the search box has focus.
- **Highlighted note:** the single note currently targeted by search navigation.
- **[Future] Slash navigation mode:** input mode entered when query starts with
  `/`; intended for quick tree navigation rather than text matching.

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

## [Future] Slash navigation

1. If the query starts with `/`, the input switches from text search semantics
   to navigation semantics.
2. In slash navigation mode, results represent navigable tree targets at the
   current level (starting from document/root scope).
3. `ArrowUp`/`ArrowDown` cycle through the shown targets and keep one active
   highlight.
4. Cycling targets updates the visible input path so the field reflects the
   currently highlighted navigation target.
5. Adding another `/` descends into the highlighted target and switches results
   to its children.
6. Entering `/` and pressing `Enter` immediately zooms out to document level
   (root scope) and shows a root-level highlight cue.
7. Pressing `Enter` with a deeper slash path jumps/zooms to the currently
   highlighted target.
8. `Escape` exits slash navigation mode and returns focus to the editor.
