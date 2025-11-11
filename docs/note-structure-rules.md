# Outline Editing Invariants

This document defines the core invariants that govern structural outline editing
operations in RemDo. These rules ensure that indenting, outdenting, and
reordering notes preserve a valid tree structure and maintain clarity in the
outline hierarchy. Review the conceptual model in
[Concepts](./concepts.md) and its
[Examples section](./concepts.md#examples) before diving into the behavioral
details below.

## Design Goals

- **Preserve subtrees:** Every move acts on whole notes, including all
  descendants.
- **Prevent illegal structures:** No cycles, no orphaned descendants; invalid
  operations become no-ops.
- **Parity of interactions:** Keyboard and drag-and-drop perform equivalent
  structural operations.
- **Predictability:** Outdent/indent placement is deterministic, so the same
  command always lands notes in the expected position.

## Shortcut Summary

| Shortcut / Command | Operation | Result |
| ------------------ | --------- | ------ |
| `Tab`              | Indent    | Nests the selected note(s) under the previous sibling when allowed. |
| `Shift+Tab`        | Outdent   | Moves the selected note(s) up one level and inserts them immediately after the former parent. |

All other selection gestures and shortcuts are documented in
[Selection](./selection.md); the invariants below describe the outcomes those
gestures must respect.

## Subtree Atomic Move

Any structural move operation (indent, outdent, reorder) applied to a note
selection applies to the **entire subtree** anchored at each selected note. In
other words, a note **always moves together with all of its children** (and
further descendants).

- **Allowed:** Moving a note relocates that note and all of its descendant notes
  as one unit. For example, reordering "note1" (which has children) under
  "note2" makes "note1" a child of "note2", while all of "note1's" children stay
  attached to "note1" and therefore become deeper descendants of "note2". No
  child is left behind or orphaned by the move.
- **Disallowed:** No operation can ever separate a note from its children. It is
  **not possible** to move or indent only part of a subtree. For example, you
  cannot indent "note1" under another note while leaving its child "note1.1"
  behind at the original level – such a partial move is invalid (the system will
  always move "note1.1" along with "note1").

_Rationale:_ This invariant guarantees that the outline’s hierarchy is
preserved. Any change in structure to a parent note automatically includes its
entire subtree, preventing orphaned children or broken hierarchies.

## Valid Indentation

Indenting a note selection is only allowed when there is a valid preceding
sibling to serve as the new parent. In practical terms, **you can only indent a
note under its immediate previous sibling**. If that condition isn’t met, the
indent operation is a no-op.

- **Allowed:** Indent a single note or a contiguous selection of sibling notes
  if there is an earlier sibling at the same level. The indented notes become
  children of that previous sibling. If multiple notes are selected together,
  indenting nests the entire selection under the previous sibling while
  preserving their order and internal structure.
- **Disallowed:** You cannot indent a note that has no preceding sibling at its
  level. For example, indenting the first note in a list (which has no sibling
  above it) has no effect – there is no valid parent to indent under. Similarly,
  indenting is disallowed if it would violate the tree structure (you cannot
  indent a note under a distant non-sibling or under itself, etc. – such actions
  are prevented by the structure rules).

**Example (Valid Indent):** Starting with a flat list of notes:

```
- note1
- note2
- note3

```

If we indent "note2", and "note1" is directly above it, the result is:

```
- note1
  - note2
- note3

```

"note2" becomes a child of "note1". (If "note2" had its own sub-notes, they
would move with it under "note1" due to **Subtree Atomic Move**.)

**Example (Invalid Indent):** If we try to indent "note1" (the first note in the
list), nothing happens because there is no previous sibling to indent under. The
operation is ignored since "note1" cannot be made a child of anything above it.

_Rationale:_ Requiring a valid preceding sibling ensures indentation never
creates cycles or cross-level jumps; every indent is an explicit “make this a
child of the note right above me” command.

## Valid Outdentation

Outdenting a note selection is only allowed if the notes have a parent to move
out of—i.e. the notes are not already at the root level. Outdenting moves the
selection up one level, making it a sibling of its current parent. If these
conditions aren’t met, the outdent operation is invalid or does nothing.

- **Allowed:** Outdent a note or a contiguous selection of sibling notes that
  currently has a parent. The notes are removed from that parent and become its
  siblings (effectively moving up one level in the hierarchy). When multiple
  notes under the same parent are selected, outdenting lifts the entire
  selection together while preserving their order.
- **Disallowed:** You cannot outdent a top-level note (a note with no parent)
  because there is no higher level to move it to. Any outdent action that would
  break the tree structure or ordering—such as skipping levels—is prevented.

**Example (Valid Outdent):** Given a structured outline:

```text
- note1
  - note2
- note3
```

"note2" is a child of "note1". If we outdent "note2", it moves up one level to
become a sibling of "note1" (and of "note3"):

```text
- note1
- note2
- note3
```

Now "note2" is at the root level. (If "note2" had its own children, they would
come along and remain under "note2", due to **Subtree Atomic Move**.)

**Example (Invalid Outdent):** Attempting to outdent "note1" (which is already a
top-level note) will do nothing, because "note1" has no parent to move out of.
The outline structure remains unchanged, as you cannot outdent above the root.

_Rationale:_ Outdentation only works when there is a real parent to exit; this
keeps the tree rooted, predictable, and free of phantom levels.

### Outdent Placement

The default outdent command (shortcut `Shift+Tab`) moves the selected notes up
one level and inserts them immediately after their former parent. The subtree
now lives right below that parent, so it retains the same chronological context
without leaping ahead of unrelated siblings. If the parent was already the last
note at that depth, the promoted notes naturally become the final entries as
well. This mirrors the behavior of whole-note outliners and keeps quick
restructures predictable.

## Whole-Note Selection

Selections that cross note boundaries always snap to entire notes (and their
subtrees). Structural expansion is driven by `Shift+Up/Down`, which walk through
contiguous sibling slabs before climbing to parents, while `Shift+Left/Right`
stay confined to inline text. This keeps every structural command operating on
complete notes rather than fragments and ensures collaboration semantics stay
deterministic.
See [Selection](./selection.md) for the full gesture, shortcut, and progressive
selection behavior.

## Reordering Behavior

Reordering respects all the above invariants and is essentially a more free-form
way to reorder or reparent notes:

- **Sibling Reordering:** Moving a note to a new position among its current
  siblings will reorder it within the same parent. This doesn’t change its
  level, just the order. (All children move with it due to **Subtree Atomic
  Move**.)
- **Indenting via Placement:** Placing a note **onto** another note (or into the
  space that indicates it should become a child of that note) will indent the
  moved note under the target note. This is only allowed if the target note is a
  valid new parent (following the **Valid Indentation** rule). The moved note
  (with its subtree) becomes the last child of the target.
- **Outdenting/Reparenting via Placement:** Moving a note to a position outside
  its current parent (for example, positioning it right after its parent or at
  the root level) will outdent it or reparent it to a higher level. This is only
  allowed if there is a valid place to position it (following **Valid
  Outdentation** rules). For instance, you can move a sub-note out to the root
  list to make it a top-level note. You cannot place a note in a position that
  breaks the outline structure (such placements will be disallowed by the
  editor).
- **No Invalid Placements:** The system prevents placements that violate outline
  invariants. For example, you **cannot** position a note inside one of its own
  descendants – such an action is invalid because it would create a cycle in the
  hierarchy. Any attempt to do so will be blocked, preserving the acyclic tree
  structure.

Overall, reordering operations are just another way to invoke
indent/outdent/reorder under the hood. They must honor **Subtree Atomic Move**
(the note and its children move together) and the validity rules for
indenting/outdenting (only legal parent/child relationships can be created). All
outline modifications, whether invoked via keyboard shortcuts or other
reordering affordances, thus follow the same invariant rules to keep the
document structure consistent and predictable.
