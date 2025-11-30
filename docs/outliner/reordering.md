# Reordering (keyboard)

Scope: keyboard-driven reordering. Supports sibling swaps and boundary moves
that reparent according to the rules below. Drag-and-drop is covered in
`./drag-and-drop.md`.

## Command surface (sibling order only)

1. **Move Down:** Swaps the selected note (or contiguous selection) with the
   next sibling when one exists.
2. **Move Up:** Swaps the selected note (or selection) with the previous
   sibling when one exists.

## Boundary reparenting

When a move crosses a parent boundary, the selection relocates according to
outliner expectations while preserving order and subtree atomicity:

1. **Move Down from the last child:** If the parent has a next sibling, the
   selection becomes that sibling’s first child. If the parent has no next
   sibling, the selection outdents and is inserted immediately after the parent.
2. **Move Up from the first child:** If the parent has a previous sibling, the
   selection becomes that sibling’s last child. If the parent has no previous
   sibling, the selection outdents and is inserted immediately after the parent
   (consistent with the standard outdent placement).

## Boundary behavior

Moves at the topmost or bottommost sibling become no-ops, avoiding surprises and
keeping order deterministic.
