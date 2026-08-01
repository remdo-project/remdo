# Mobile Action Toolbar

The touch action toolbar is a row of note-action buttons docked at the bottom of
the editor on touch devices, giving pointer-only users the structural actions
that otherwise need a keyboard. It reuses the same operations as their keyboard
and [menu](./menu.md) entries while owning only the toolbar surface and its
behavior.

## Presence

1. The toolbar is present only on touch devices — those whose primary pointer is
   coarse and cannot hover.
2. While the on-screen keyboard is shown, the toolbar docks directly above it.
   When the keyboard is dismissed, the toolbar rests at the bottom of the
   viewport, clearing the device safe-area inset.

## Actions

1. The toolbar carries these actions: indent, outdent, move up, move down, toggle
   done, toggle fold, delete, undo, redo, open note menu.
2. A selection in the [view header](./view-header.md#structural-boundary)
   supplies no note target to the toolbar. Otherwise, the structural actions
   target the current selection: the
   [editor note](./note-model.md#note-kinds) owning the
   [outline selection region](./selection.md#selection-states) of a
   [caret or inline text selection](./selection.md#selection-states), or every
   note in a [selected note range](./selection.md#note-ranges).
   [Body](./body.md#selection-and-structural-targeting) owns the mapping from a
   body [selection region](./selection.md#selection-states) to its editor note.
   The action contracts are:
   - Indent / outdent, per
     [Indentation](./indentation.md).
   - Move up / move down, per
     [Reordering](./reordering.md).
   - Toggle done per
     [List types](./list-types.md#toggling).
   - Delete removes the targeted notes and their subtrees per
     [Deletion](./deletion.md), with no confirmation step. For a caret this
     removes the [focus note](./selection.md#selection-states), not the caret
     merge that Backspace performs. The current
     [zoom root](./zoom.md#definitions) supplies no delete target.
3. Outside the view header, toggle fold acts on the focus note unless it is the
   current zoom root, per [Folding](./folding.md).
4. Undo and redo act on the document's edit history rather than the selection,
   reversing and reapplying the most recent edits.
5. Open note menu opens the [quick action menu](./menu.md).

## Layout

1. The toolbar has two groups: a **pinned** group of always-reachable primary
   actions and a **scrolling** group holding the rest, separated by a divider.
   Toggle done and undo are pinned; every other action scrolls.
2. The pinned group sits beside — never overlapping — the scrolling group.
3. Within the pinned group, an action that is always present holds a fixed
   position at the group's outer edge; an action that may hide (below) occupies
   the inner edge.
4. The scrolling group starts at its leading edge, so its first action is
   visible without scrolling; it scrolls horizontally when its actions exceed the
   available width and signals that it scrolls rather than presenting a
   static edge.

## Capability

1. Toggle fold is disabled in a view header, at the current zoom root, or when
   the focus note has no children, per [Folding](./folding.md).
2. Delete is disabled when the current selection has nothing deletable, per
   [Deletion](./deletion.md).
3. Undo and redo are each disabled when the history has nothing to reverse or
   reapply in that direction.
4. Every other action stays enabled and no-ops when it cannot apply.
5. A disabled action in the scrolling group stays visible (rendered disabled) so
   its availability is discoverable; a disabled action in the pinned group is
   hidden.
6. A disabled action is exposed as disabled to assistive technology while
   remaining focusable (`aria-disabled`), not removed from the focus order.

## Behavior

1. Activating an action keeps the editor focused, so the keyboard stays up.

## Future

- Capability reflection for indent, outdent, and move up/down: disable each when
  it cannot apply to the current selection, once non-mutating capability
  predicates exist for them.

## References

- [WCAG 2.4.11 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
  — a focused component must not be entirely hidden by other content (Layout 2).
- [WAI-ARIA `aria-disabled`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-disabled)
  — marking a control disabled while keeping it focusable (Capability 6).
