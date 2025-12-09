# Deletion

Defines how `Backspace` (Mac "Delete") and forward `Delete` behave in caret mode
and structural mode. Relies on selection states in
`docs/outliner/selection.md`; inline ranges never span multiple notes.

## Scope and terms

1. **Caret mode:** caret or inline range inside a single note.
2. **Structural mode:** contiguous note range selection (entire notes +
   descendants).
3. **Backspace:** removes the character before the caret. **Delete:** removes
   the character after the caret when available.

## Caret mode (collapsed caret or inline range)

1. Inline text range: `Backspace`/`Delete` remove only the highlighted
   characters. Crossing a note boundary snaps to structural selection, so caret
   deletion never touches partial notes.
2. Start of note (caret at column 0):
   1. First note in the document: **no-op**; caret stays put.
   2. Any note with children (expanded or collapsed): **no-op** to avoid
      implicit hoists or subtree loss.
   3. Leaf note with a previous sibling: delete the note and append its text to
      the end of the previous sibling using the spacing rule below. Caret lands
      at the join point.
   4. Leaf note that is the first child: delete the note and append its text to
      the end of the parent's body (spacing rule). Caret lands at the join
      point in the parent.
   5. Empty leaf note: delete it; caret moves as in 3/4. No surrounding text is
      altered.
3. End of note (caret at final character):
   1. If the next sibling is a leaf: forward `Delete` merges that sibling into
      the current note (spacing rule), then removes the sibling. Caret stays at
      the join point.
   2. If the next sibling has children **or** the current note has children:
      forward `Delete` is a **no-op**; use structural selection to change
      structure explicitly.
4. Middle of a note: `Backspace`/`Delete` behave like a plain text editor.

## Structural selection (contiguous note range)

1. Pressing `Backspace` or `Delete` removes the selected notes and all of their
   descendants.
2. Focus after deletion:
   1. If a next sibling remains at the same depth, place the caret at its
      start.
   2. Else if a previous sibling remains, place the caret at its end.
   3. Else place the caret at the end of the parent's body (root when deleting
      the last top-level note).
3. Undo/redo restores both text and tree shape atomically.

## Spacing rule for merges

1. When concatenating two note bodies, insert exactly one space **iff**:
   1. the left text is non-empty and does not already end with whitespace; and
   2. the right text is non-empty and does not already start with whitespace.
2. Otherwise concatenate as-is to preserve intentional spacing or punctuation.

## Non-goals / explicit no-ops

1. `Backspace` at the start of a note never promotes its children or performs
   automatic hoists; structural commands remain the only way to reparent.
2. Deletion does not create a "trash" bin or soft-delete layer; recovery is via
   undo/redo.
3. Inline deletions never cross note boundaries; cross-note deletions always
   rely on structural selection.

## Future / parking lot

1. [Future] Should collapsed parents show a brief affordance when a no-op
   occurs so users understand why nothing happened?
