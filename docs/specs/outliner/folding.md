# Folding (Collapse / Expand)

Folding hides or reveals a note's descendants. It is a presentation filter
only; it never changes the underlying outline structure or note identities.

## Definitions

- **Folded note:** A note with children whose descendants are hidden.
- **Fold toggle:** The +/- affordance shown beside a note row on hover.

## Core behavior

1. Single-note folding requires a note target with children that is not the
   current [zoom root](./zoom.md#definitions). Without such a target,
   single-note folding is unavailable. Leaf notes and the current zoom root
   never show the row toggle.
2. The toggle appears when the pointer is within a note's row bounds and inside
   the editor width, or when the note is the caret/focus target. It is rendered
   to the left of the note content. `+` means folded; `-` means expanded.
3. Toggling fold state hides or reveals descendants. Descendants keep their own
   fold status when an ancestor is toggled.
   Using the row toggle returns DOM focus to the editor and leaves the
   [focus note](./selection.md#selection-states) unchanged, so typing continues
   where it left off; the toggle itself never becomes the focused element.
4. Folding is saved per note and synced in collaboration; undo/redo restores it
   like any other edit.
5. If folding would hide the active selection, it collapses to the folded note
   (caret at end of its text). Hidden descendants are not selectable.
6. If a child is inserted or moved under a folded parent, the parent
   auto-expands. If a note loses its last child, it is no longer folded.
7. On a middle [split](./insertion.md#default-behavior-caret-selection), folded
   state follows the children to the fresh trailing note. When a merge transfers
   the removed note's children to a survivor that otherwise has no children,
   the survivor inherits the removed note's folded state.
8. [Zoom](./zoom.md) defines the outer visible [zoom boundary](./zoom.md#definitions);
   folding applies inside that view and zooming does not reset folding.
9. Exception: when a folded note is the current
   [zoom root](./zoom.md#definitions), its own fold state does not hide its direct children in the
   [subtree view](./zoom.md#visibility-and-editing-boundary). Those children
   remain visible there, and deeper visibility is determined by each
   descendant's own fold state.

## Fold To Level

1. A fold level from `1` through `9` folds notes inside the current zoom
   boundary so that only notes up to that level remain visible.
2. Level is counted from the current view root:
   - in the [document-root view](./zoom.md#visibility-and-editing-boundary), level `1` leaves only top-level notes visible;
   - in a [subtree view](./zoom.md#visibility-and-editing-boundary), level `1` leaves the zoom root and its direct children visible.
3. Level `0` fully unfolds the current [zoom boundary](./zoom.md#definitions).
4. Applying a level changes existing stored fold state for notes inside the current
   zoom boundary.
5. If applying a fold level would hide the active caret or structural
   selection, focus collapses to the nearest still-visible ancestor note.
6. Existing manual folds inside the zoom boundary may be overwritten. Applying
   a level does not preserve or later restore a prior fold layout.
