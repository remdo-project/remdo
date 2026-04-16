# Folding (Collapse / Expand)

## Purpose

Define how RemDo hides or reveals a note's descendants. Folding is a
presentation filter only; it never changes the underlying outline structure or
note identities.

## Definitions

- **Folded note:** A note with children whose descendants are hidden.
- **Fold toggle:** The +/- affordance shown beside a note row on hover.

## Core behavior

1. Only notes with children are foldable. Leaf notes never show the toggle.
2. The toggle appears when the pointer is within a note's row bounds and inside
   the editor width, or when the note is the caret/focus target. It is rendered
   to the left of the note content. `+` means folded; `-` means expanded.
3. Toggling fold state hides or reveals descendants. This can be done via the
   row toggle or via the note menu keyboard path (`Shift`, `Shift`, then `F`).
   Folding is view-only and never changes structure or order. Descendants keep
   their own fold status when an ancestor is toggled.
4. Folding is saved per note and synced in collaboration; undo/redo restores it
   like any other edit.
5. If folding would hide the active selection, it collapses to the folded note
   (caret at end of its text). Hidden descendants are not selectable.
6. Structural operations remain subtree-atomic; insertion rules in
   [Insertion](./insertion.md) are unchanged. If a child is inserted or moved under a
   folded parent, the parent auto-expands. If a note loses its last child, it is
   no longer folded.
7. Zoom defines the outer visible subtree; folding applies inside that view and
   zooming does not reset folding.
8. Exception: when a folded note is the current zoom root, its own fold state
   does not hide its direct children in the zoomed view. Those children remain
   visible there, and deeper visibility is determined by each descendant's own
   fold state.
9. The zoom-root exception is presentation-only. The folded state remains saved
   on the note and takes effect again when the note is shown in a non-zoomed
   parent context.
10. Fold command API is state-based: `folded`, `unfolded`, or `toggle`.

## Fold To Level

1. `Shift`, `Shift`, then `1` through `9` folds notes inside the current zoom
   boundary so that only notes up to that level remain visible.
2. Level is counted from the current view root:
   - in document-root view, level `1` leaves only top-level notes visible;
   - in subtree zoom, level `1` leaves the zoom root and its direct children
     visible.
3. Pressing `0` fully unfolds the current zoom boundary.
4. The command changes existing stored fold state for notes inside the current
   zoom boundary. It is not a separate transient zoom/view mode.
5. The command appears as `Fold to level [0-9]` in the quick action menu's
   `View` section and applies from the current zoom root (document root or
   subtree root), regardless of which visible note opened the quick action
   menu. Clicking it applies level `1`.
6. Notes outside the current zoom boundary are unaffected.
7. If applying a fold level would hide the active caret or structural
   selection, focus collapses to the nearest still-visible ancestor note.
8. Existing manual folds inside the scoped subtree may be overwritten by the
   command. The command does not preserve or later restore a prior fold layout.
