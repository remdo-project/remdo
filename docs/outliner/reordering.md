# Reordering (keyboard)

Scope: keyboard-driven reordering. Drag-and-drop is covered in
`./drag-and-drop.md`.

## Shortcuts

- macOS: `Ctrl+Shift+ArrowUp` / `Ctrl+Shift+ArrowDown`
- Windows/Linux: `Alt+Shift+ArrowUp` / `Alt+Shift+ArrowDown`

## Command model (single directional move)

Reordering uses one directional model for both commands:

1. Try a level-preserving swap with the adjacent sibling in the requested
   direction.
2. If there is no adjacent sibling, try one-level reparent through the parent's
   adjacent sibling:
   1. **Move Down:** if the current parent has a next sibling, move the subtree
      as that sibling's first child.
   2. **Move Up:** if the current parent has a previous sibling, move the
      subtree as that sibling's last child.
3. If reparent is not possible, try one-level outdent:
   1. **Move Down:** insert the subtree immediately after its former parent.
   2. **Move Up:** insert the subtree immediately before its former parent.
4. If outdent is not possible, the command is a no-op.

Each keypress performs exactly one successful step from this fallback cascade.
Commands never skip multiple levels in a single move.

## Zoom boundary

When zoom is active, each fallback step is valid only if the resulting
placement stays inside the zoom boundary:

1. Steps that would move the subtree outside the zoom boundary are skipped.
2. The command continues through the fallback cascade using only in-boundary
   steps.
3. If no fallback step stays in boundary, the command is a no-op.

## Structural guarantees

1. Subtree-atomic moves still apply: a note always moves with all descendants.
2. Selection constraints still apply: reorder operates on contiguous sibling
   slabs.
3. Reparent/outdent fallback changes depth by at most one level per command.
