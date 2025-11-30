# Drag and Drop Reordering

## Status

Drag-and-drop reordering is currently not supported in RemDo. This page will
capture the pointer-first behavior once it is implemented.

## Planned placement semantics

- **Indent via placement:** Dropping onto a note (or into its “make child”
  affordance) indents the dragged note under that target when the target is a
  valid parent (per Valid Indentation). The moved subtree becomes the target’s
  last child.
- **Outdent/reparent via placement:** Dropping outside the current parent (for
  example, right after the parent or at root) outdents/reparents the subtree
  when the position is valid (per Valid Outdentation). Invalid placements (e.g.,
  into a descendant) are blocked.
