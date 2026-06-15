# Selection

This document defines the cursor-driven selection model used throughout RemDo.
Structural commands depend on these guarantees, so they are the contract for
both UX and implementation. The structural outcomes are detailed in
[Note Structure Rules](./note-structure-rules.md).

## Selection states

A selection is always exactly one of:

1. **Caret / inline text range** — the caret, or a text range, inside a single
   note. Typing, inline formatting, and inline delete operate on it. Structural
   commands treat the caret's note (and its subtree) as their target even with
   no visible range.
2. **Note range** — a contiguous slice of the outline covering one or more whole
   notes, each with its entire subtree, stored in tree order.

There is no non-contiguous selection.

**Mode switch.** Typing inserts characters only in state 1. As soon as the
selection covers any whole note (state 2), the editor is in structural mode:
typing and `Enter` are no-ops and only structural commands respond. `Esc`, or
clicking into a note's text, collapses back to a caret.

## Whole-note snapping

A selection can never partially cross a note boundary. The moment a text
selection extends beyond one note's content, it snaps to a **contiguous run of
sibling notes, each including its entire subtree** — nothing in that slice is
skipped or partially selected (selecting `note6` includes its child `note7`).
This lets every structural command assume it operates on whole subtrees.

## The selection ladder

Structural selection grows and shrinks along a single ordered ladder. Its
defining property is **symmetric grow/shrink**: pressing the opposite direction
*exactly inverts* the previous step — it undoes, it never re-derives.

The ladder is anchored and replayable:

- **One anchor.** The note where structural selection began. It is fixed for the
  life of the ladder and is cleared only when the selection collapses to a caret.
- **Rungs.** Each step is a semantic instruction, not a stored range. The
  selection is always the anchor plus the current rungs, re-resolved against the
  live tree. The recurrence is:
  1. the anchor note's inline body (skipped when the body is empty);
  2. the anchor note plus its subtree — the first structural rung,
     direction-neutral;
  3. one more contiguous sibling (with its subtree) in the sweep direction;
  4. when siblings in that direction are exhausted, the parent note (with its
     subtree), then resume sibling steps at the parent's level;
  5. repeat to the document root (or the [zoom](./zoom.md) boundary).

Direction and reversal:

- The first structural rung is direction-neutral. The press that first extends
  past the anchor's subtree establishes the sweep direction.
- Pressing the sweep direction pushes the next rung; pressing the opposite
  direction pops the last rung.
- When the ladder pops fully back to the caret, the next press in the same
  (now opposite) direction begins a fresh ladder in that direction.
- A press that would extend past the document or zoom boundary is a no-op.

Because the selection is replayed from intent, a collaboration edit reshapes it
in place where possible; the disturbance tiers are defined in
[Collaboration reshaping](#collaboration-reshaping).

## Input bindings

| Input | Effect |
| ----- | ------ |
| `Shift+Left/Right` | Inline-only text selection inside the active note; a no-op at the note boundary. |
| `Shift+Up/Down` | Walk the selection ladder one note at a time in that direction (push the next rung, or pop on reversal). |
| `Cmd/Ctrl+A` | Walk the same ladder one rung per press, adding the whole sibling slab of a sibling rung at once. |
| `Shift+Click` | Extend from the anchor to the clicked note, producing a contiguous note range on the same ladder. |
| Drag | Highlights text until it crosses a note boundary, then snaps to whole notes. |
| Long-press (touch) | Enters caret selection; dragging handles behaves like text selection until it crosses a boundary, then snaps to whole notes. |
| `Esc` | Collapses any note range to a caret without changing the document. |
| Unmodified Arrow / `Home` / `End` / `Page` keys | Collapse a note range and place the caret at the corresponding edge (start/end or top/bottom) so typing resumes there. |
| `Tab` / `Shift+Tab` | Indent / outdent the selection — see [Note Structure Rules](./note-structure-rules.md). |
| `Enter` | Caret mode: see [Insertion](./insertion.md). Structural mode: no-op. |

## Collaboration reshaping

The ladder stores intent, so a disturbance (a remote edit, undo/redo) is graded
by how much it perturbs the replay:

1. Anchor and rungs still resolve → the selection re-resolves and follows the new
   shape, including subtree growth/shrink of swept notes. No visible disruption.
2. A rung's target was deleted or re-parented out → the ladder truncates to the
   deepest still-valid rung.
3. The anchor itself is gone → the selection collapses to a caret near the former
   anchor.

[Folding](./folding.md) and [zoom](./zoom.md) define what happens when a view
change hides the active selection.

## Command compatibility

| Selection state | Allowed operations |
| --------------- | ------------------ |
| Caret / inline text range | Typing, inline formatting, inline delete/backspace, toggle checked (per [List Types](./list-types.md)); structural commands act on the caret's note and subtree. |
| Note range | Indent/outdent, reorder, duplicate, convert note type, delete, copy/paste, toggle checked, and other structural commands, always executed in document order. |

Clipboard behavior for note ranges and inline ranges is defined in
[Clipboard](./clipboard.md).
