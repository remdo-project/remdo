# Outline Editing Invariants

This document defines the core invariants that govern structural outline editing
operations in RemDo. These rules ensure that indenting, outdenting, and
reordering notes preserve a valid tree structure and maintain clarity in the
outline hierarchy.

## Subtree Atomic Move

Any structural move operation (indent, outdent, reorder) applied to a note
applies to the **entire subtree** of that note. In other words, a note **always
moves together with all of its children** (and further descendants).

- **Allowed:** Moving a note relocates that note and all of its descendant notes
  as one unit. For example, reordering "note1" (which has children) under
  "note2" makes "note1" a child of "note2", while **all of "note1's" children
  stay attached to "note1"** and therefore become deeper descendants of "note2".
  No child is left behind or orphaned by the move.
- **Disallowed:** No operation can ever separate a note from its children. It is
  **not possible** to move or indent only part of a subtree. For example, you
  cannot indent "note1" under another note while leaving its child "note1.1"
  behind at the original level – such a partial move is invalid (the system will
  always move "note1.1" along with "note1").

_Rationale:_ This invariant guarantees that the outline’s hierarchy is
preserved. Any change in structure to a parent note automatically includes its
entire subtree, preventing orphaned children or broken hierarchies.

## Valid Indentation

Indenting a note (or a group of notes) is only allowed when there is a valid
preceding sibling to serve as the new parent. In practical terms, **you can only
indent a note under its immediate previous sibling**. If that condition isn’t
met, the indent operation is a no-op or blocked.

- **Allowed:** Indent a note (or a contiguous block of notes) if there is an
  earlier sibling at the same level. The indented note(s) will become children
  of that previous sibling. If multiple sibling notes are selected together,
  indenting will nest all of them under the first note’s previous sibling,
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

**Example (Invalid Indent):** If we try to indent "note1" (the first item in the
list), nothing happens because there is no previous sibling to indent under. The
operation is invalid/ignored since "note1" cannot be made a child of anything
above it.

## Valid Outdentation

Outdenting a note (or a group of notes) is only allowed if the note has a parent
to move out of – i.e. the note is not already at the root level. Outdenting will
move the note up one level, making it a sibling of its current parent. If these
conditions aren’t met, the outdent operation is invalid or does nothing.

- **Allowed:** Outdent a note (or a block of sibling notes) that currently has a
  parent. The note(s) will be removed from their current parent and become
  siblings of that parent (effectively moving up one level in the hierarchy).
  When multiple notes under the same parent are selected, outdenting lifts the
  entire group out together, preserving their order.
- **Disallowed:** You cannot outdent a top-level note (a note with no parent)
  because there is no higher level to move it to. Also, any outdent action that
  would break the tree structure or ordering is disallowed (for example, an
  outdent that tries to skip levels or create an invalid position will be
  prevented).

**Example (Valid Outdent):** Given a structured outline:

```
- note1
  - note2
- note3

```

"note2" is a child of "note1". If we outdent "note2", it moves up one level to
become a sibling of "note1" (and of "note3"):

```
- note1
- note2
- note3

```

Now "note2" is at the root level. (If "note2" had its own children, they would
come along and remain under "note2", due to **Subtree Atomic Move**.)

**Example (Invalid Outdent):** Attempting to outdent "note1" (which is already a
top-level note) will do nothing, because "note1" has no parent to move out of.
The outline structure remains unchanged, as you cannot outdent above the root.

### Outdent Variants

RemDo exposes two first-class outdent operations. Both follow the constraints
above and honor **Subtree Atomic Move** and **Whole-Note Selection**; the only
difference is the position they take among the new siblings:

- **Structural Outdent (default shortcut `Shift+Tab`):** Moves the selected note
  block out of its parent and appends it directly after that parent in the new
  sibling list. This keeps chronological ordering with the parent but may change
  the relative order among peers. The moved block always lands at the end of the
  new level, which matches WorkFlowy-style editors and keeps the hierarchy easy
  to reason about during quick restructures.
- **In-Place Outdent:** Moves the same block out of its parent while preserving
  its previous vertical order. The reparented block is inserted immediately
  after the ancestor it previously followed, so siblings that were not part of
  the operation do not leapfrog it. This variant works on multi-note selections,
  keeps entire subtrees contiguous, and is the preferred command when you only
  want to change indentation depth without altering the document’s reading order.

Both commands are available through keyboard shortcuts and the command palette.
Choosing between them is a per-operation decision; there is no global toggle so
that collaboration semantics remain deterministic across clients.
Regression tests cover both variants: structural outdent assertions focus on
tree depth changes, while in-place outdent tests verify the preorder text order
remains unchanged other than the promoted subtree.

## Whole-Note Selection

Selections that cross note boundaries always snap to entire notes (and their
subtrees). This keeps every structural command operating on complete notes
rather than fragments and ensures collaboration semantics stay deterministic.
See `docs/selection.md` for the full gesture, shortcut, and progressive
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
indent/outdent/reorder under the hood. They must honor **SubtreeAtomicMove**
(the note and its children move together) and the validity rules for
indenting/outdenting (only legal parent/child relationships can be created). All
outline modifications, whether invoked via keyboard shortcuts or other
reordering affordances, thus follow the same invariant rules to keep the
document structure consistent and predictable.
