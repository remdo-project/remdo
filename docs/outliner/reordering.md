# Reordering (keyboard)

Scope: keyboard-driven reordering. Moves are level-preserving: they reorder
contiguous sibling slabs without changing their depth. Drag-and-drop is covered
in `./drag-and-drop.md`.

## Shortcuts

- macOS: `Ctrl+Shift+ArrowUp` / `Ctrl+Shift+ArrowDown`
- Windows/Linux: `Alt+Shift+ArrowUp` / `Alt+Shift+ArrowDown`

## Command surface (level-preserving)

1. **Move Down:** Swaps the selected note (or contiguous selection) with the
   next sibling when one exists.
2. **Move Up:** Swaps the selected note (or selection) with the previous
   sibling when one exists.

## Boundary behavior

Moves at the topmost or bottommost sibling are no-ops; reparenting and outdent
on reorder are explicitly disallowed to keep depth stable and behavior
predictable.
