# Outline Editing Invariants

Structural invariants for outline editing: the rules that indent, outdent, and
reorder must satisfy to keep the note tree valid. The conceptual model —
including
[indentation semantics (concept vs. adapter)](./concepts.md#indentation-concept-vs-adapter)
— is owned by [Concepts](./concepts.md); selection behavior (whole-note
snapping, shortcut ladder) is owned by [Selection](./selection.md) and assumed
here.

## Zoom Boundary Constraint

When zoom is active, indent/outdent must keep the moved subtree inside the zoom
boundary (the zoom root and descendants). Any indent/outdent that would move
the selection outside that boundary is a no-op.

Examples:

- Indenting the zoom root is a no-op.
- Outdenting the zoom root is a no-op.
- Outdenting a direct child of the zoom root is a no-op.

## Subtree Atomic Move

Any structural move (indent, outdent, reorder) applies to the entire subtree
anchored at each selected note: a note always moves together with all of its
descendants, and no operation can separate a note from its children.

Deletion merges are an explicit exception: merging two notes may reparent the
removed note's children to the survivor — see [Deletion](./deletion.md).

## Valid Indentation

Indenting a note selection is allowed only when the selection has an immediate
preceding sibling; the indented notes become that sibling's children. A
contiguous sibling selection nests as one unit, preserving its order and
internal structure. Without such a sibling (for example the first note at its
level), indent is a no-op.

_Rationale:_ an indent is always "become a child of the note directly above",
which rules out cycles and cross-level jumps.

## Valid Outdentation

Outdenting a note selection is allowed only when the notes have a parent: the
selection moves up one level to become siblings of that parent. A contiguous
selection under one parent lifts as one unit, preserving its order. Outdenting
a top-level note is a no-op.

### Outdent Placement

The outdent command (shortcut `Shift+Tab`) inserts the promoted notes
immediately after their former parent, so the subtree keeps its context instead
of leaping ahead of unrelated siblings.

## Reordering Behavior

Reordering semantics are defined in [Reordering (keyboard)](./reordering.md);
this document supplies the structural invariants those commands rely on.
