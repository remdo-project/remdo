# Mobile Action Toolbar

Defines the touch action toolbar: a single row of note-action buttons docked at
the bottom of the editor on touch devices, giving pointer-only users the
structural actions that otherwise need a keyboard. It reuses the same operations
as their keyboard and [menu](./menu.md) entries; this doc defines only the
toolbar surface and its behavior, not those operations.

## Presence

1. The toolbar is present only on touch devices — those whose primary pointer is
   coarse and cannot hover.
2. While the on-screen keyboard is shown, the toolbar docks directly above it.
   When the keyboard is dismissed, the toolbar rests at the bottom of the
   viewport, clearing the device safe-area inset.

## Actions

1. The toolbar exposes these actions, left to right: indent, outdent, move up,
   move down, toggle done, toggle fold, delete, undo, redo, open note menu.
2. The structural actions target the current [selection](./selection.md): the
   focused note for a caret selection, or every head of a structural multi-note
   selection. Each acts identically to its existing entry:
   - Indent / outdent, per the [selection](./selection.md) structural rules and
     the [zoom](./zoom.md) boundary.
   - Move up / move down, per [Reordering](./reordering.md).
   - Toggle done, recursively per [List Types](./list-types.md).
   - Delete removes the targeted notes and their subtrees per
     [Deletion](./deletion.md), with no confirmation step. For a caret this
     removes the focused note (not the caret-mode merge that Backspace performs).
3. Toggle fold acts on the focus note per [Folding](./folding.md), matching the
   [menu](./menu.md)'s single-note fold contract.
4. Undo and redo act on the document's edit history rather than the selection,
   reversing and reapplying the most recent edits.
5. Open note menu opens the [quick action menu](./menu.md) for the focus note,
   giving access to the actions the toolbar does not carry.

## Capability

1. Toggle fold is disabled when the selection has no foldable note (every target
   is a leaf), per [Folding](./folding.md).
2. Delete is disabled when the current selection has nothing deletable, per
   [Deletion](./deletion.md).
3. Undo and redo are each disabled when the history has nothing to reverse or
   reapply in that direction.
4. Every other action stays enabled and no-ops when it cannot apply.

## Behavior

1. Activating an action keeps the editor focused, so the keyboard stays up and
   actions can be chained.
2. The action row scrolls horizontally when its buttons exceed the viewport
   width; no button is hidden behind an overflow affordance.

## Future

- Capability reflection for indent, outdent, and move up/down: disable each when
  it cannot apply to the current selection, once non-mutating capability
  predicates exist for them.
