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
   the editor width, regardless of horizontal position. It is rendered to the
   left of the note content. `+` means folded; `-` means expanded.
3. Clicking the toggle hides or reveals descendants. Folding is view-only and
   never changes structure or order. Descendants keep their own fold status
   when an ancestor is toggled.
4. Folding is saved per note and synced in collaboration; undo/redo restores it
   like any other edit.
5. If folding would hide the active selection, it collapses to the folded note
   (caret at end of its text). Hidden descendants are not selectable.
6. Structural operations remain subtree-atomic; insertion rules in
   `docs/insertion.md` are unchanged. If a child is inserted or moved under a
   folded parent, the parent auto-expands. If a note loses its last child, it is
   no longer folded.
7. Zoom defines the outer visible subtree; folding applies inside that view and
   zooming does not reset folding.

## Non-goals / future

1. [Future] Recursive fold/unfold gestures (for example modifier-click or
   "collapse all") are not specified yet.
2. [Future] Keyboard shortcuts for folding are out of scope for now.
