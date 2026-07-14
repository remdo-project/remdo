# Note Structure Rules

Structural invariants for outline editing: the rules that indent, outdent, and
reorder must satisfy to keep the note tree valid. The conceptual model —
including
[indentation semantics (concept vs. adapter)](./concepts.md#indentation-concept-vs-adapter)
— is owned by [Concepts](./concepts.md); selection behavior (whole-note
snapping, shortcut ladder) is owned by [Selection](./selection.md) and assumed
here.

## Zoom Boundary Constraint

When [zoom](./zoom.md) is active, indent/outdent must keep the moved subtree
inside the zoom boundary. Any indent/outdent that would move the selection
outside that boundary is a no-op.

## Subtree Atomic Move

Any structural move (indent, outdent, reorder) applies to the entire subtree
anchored at each selected note.

Deletion merges are an explicit exception: merging two notes may reparent the
removed note's children to the survivor — see [Deletion](./deletion.md).

## Valid Indentation

Indenting a [note range](./selection.md#selection-states) is allowed only when
the range has an immediate preceding sibling; the notes in the range become
that sibling's children. The range nests as one unit, preserving its order and
internal structure. Without such a sibling, indent is a no-op.

## Valid Outdentation

Outdenting a note range is allowed only when its notes have a parent: the range
moves up one level to become siblings of that parent. It lifts as one unit,
preserving its order. Outdenting a top-level note is a no-op.

### Outdent Placement

The outdent command (shortcut `Shift+Tab`) inserts the promoted notes
immediately after their former parent.

## Reordering Behavior

Reordering semantics are defined in [Reordering (keyboard)](./reordering.md);
this document supplies the structural invariants those commands rely on.
