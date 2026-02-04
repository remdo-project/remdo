# Deletion

Defines how `Backspace` (Mac "Delete") and forward `Delete` behave. Selection
semantics are defined in `docs/outliner/selection.md`.

## Caret mode (collapsed caret or inline range)

1. Inline text range: `Backspace`/`Delete` remove only the highlighted
   characters.
2. Boundary merge equivalence:
   `Delete` at the end of a note matches `Backspace` at the start of the next
   note (in document order), except when both boundary notes have children
   (then forward `Delete` is a no-op).

3. Backspace at start of note (caret at column 0):
   1. If the note is the first note in document order: **no-op**; caret stays
      put.
   2. Otherwise: use the previous note in document order.
      1. If either note is an empty leaf: delete the empty leaf; caret lands at
         the boundary of the surviving note (end of the previous note when
         deleting the current note, start of the current note when deleting the
         previous note). No surrounding text is altered.
      2. Otherwise: delete the current note and append its text to the end of
         the previous note (spacing rule). Caret lands at the join point in the
         previous note. If the current note has children, reparent them to the
         surviving note:
         1. If the previous note is the parent of the current note, the current
            note's children take the current note's position in that child
            list.
         2. Otherwise, append the current note's children as the last children
            of the previous note.
4. Forward `Delete` at end of note (caret at final character):
   1. If the current note is an empty leaf: delete it; focus is resolved as in
      Structural selection → Focus after deletion.
   2. Otherwise, use the next note in document order. If no next note exists,
      forward `Delete` is a no-op.
   3. If both the current note and the next note have children: forward `Delete`
      is a **no-op**.
   4. Otherwise, apply the Backspace-at-start rules to the next note (including
      empty-leaf deletion and merge/reparent behavior).
5. Middle of a note: `Backspace`/`Delete` behave like a plain text editor.

## Structural selection (contiguous note range)

1. Pressing `Backspace` or `Delete` removes the selected notes and all of their
   descendants.
2. Focus after deletion prioritizes: next sibling start → previous sibling end
   → parent end.
3. Undo/redo restores text and structure.

## Spacing rule for merges

1. When concatenating two note bodies, insert exactly one space **iff**:
   1. the left text is non-empty and does not already end with whitespace; and
   2. the right text is non-empty and does not already start with whitespace.
2. Otherwise concatenate as-is to preserve intentional spacing or punctuation.

## Non-goals / explicit no-ops

1. `Backspace` at the start of a note never performs standalone hoists; the
   only child reparenting it performs is the explicit merge behavior defined
   above.
2. Deletion does not create a "trash" bin or soft-delete layer; recovery is via
   undo/redo.

## Future / parking lot

1. [Future] Should collapsed parents show a brief affordance when a no-op
   occurs so users understand why nothing happened?
