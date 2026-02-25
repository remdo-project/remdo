# Search Mode (Focus Navigation)

## Purpose

Define user-visible behavior for document search focus/navigation mode.

Search mode is about orientation and movement while searching; query matching
and filtering can evolve later without changing the core focus flow.

## Definitions

- **Search mode:** active while the search input has focus.
- **Search highlight:** the single note currently targeted for navigation.
- **Candidate set:** notes currently visible in the active zoom boundary.

## Core behavior

1. Focusing the document search input enters search mode (including
   `Cmd/Ctrl+F` shortcut entry).
2. While search mode is active, the editor is read-only.
3. Search mode exits when the search input loses focus.
4. Pressing `Escape` in the search input returns focus to the editor, which
   exits search mode.
5. Search mode always has exactly one highlighted note.
6. On entry, highlight defaults to the zoom boundary anchor (the current zoom
   root).
7. `ArrowDown` moves highlight to the next visible note in document order
   within the active zoom boundary.
8. `ArrowUp` moves highlight to the previous visible note in document order
   within the active zoom boundary.
9. Arrow navigation stops at boundaries (no wraparound).
10. `Enter` zooms to the currently highlighted note.

## Relationship To Query Filtering

1. Search query filtering is not required for search mode to operate.
2. When query filtering is added, this interaction model remains:
   enter search mode, keep one highlight, navigate with arrows, and zoom with
   `Enter`.
3. Filtering changes which notes are visible/candidates, not the search-mode
   navigation contract.
