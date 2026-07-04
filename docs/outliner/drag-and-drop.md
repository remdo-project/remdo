# Drag and Drop Reordering

## Scope

Pointer drag-and-drop reordering is not part of RemDo's target behavior;
reordering is keyboard-driven (see [reordering](./reordering.md)).

## [Future] Planned placement semantics

- **Indent via placement:** Dropping onto a note (or into its “make child”
  affordance) would indent the dragged note under that target when the target is
  a valid parent (per Valid Indentation). The moved subtree would become the
  target’s last child.
- **Outdent/reparent via placement:** Dropping outside the current parent (for
  example, right after the parent or at root) would outdent/reparent the subtree
  when the position is valid (per Valid Outdentation). Invalid placements
  (e.g., into a descendant) would be blocked.
