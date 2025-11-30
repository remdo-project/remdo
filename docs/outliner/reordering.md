# Reordering (keyboard)

Scope: keyboard-driven sibling reordering only. Reparenting continues to use
indent/outdent, and drag-and-drop is covered in `./drag-and-drop.md`.

## Command surface (sibling order only)

1. **Move Down:** Swaps the selected note (or contiguous selection) with the
   next sibling.
2. **Move Up:** Swaps the selected note (or selection) with the previous
   sibling. Same-level only.

## Subtree atomicity

Moving any note always carries its entire subtree; partial moves are disallowed.
This keeps hierarchy intact and mirrors common outliner move semantics.

## Boundary behavior

Moves at the topmost or bottommost sibling become no-ops, avoiding surprises and
keeping order deterministic.
