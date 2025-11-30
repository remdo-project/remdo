# Reordering (keyboard)

Reordering respects the outline invariants and provides a way to reorder or
reparent notes within those rules:

Pointer-based drag-and-drop reordering is tracked separately in
`./drag-and-drop.md`.

- **Sibling Reordering:** Moving a note to a new position among its current
  siblings reorders it within the same parent. This doesn’t change its level,
  just the order. (All children move with it due to **Subtree Atomic Move**.)
