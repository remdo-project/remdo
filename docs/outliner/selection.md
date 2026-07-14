# Selection

This document defines the cursor-driven selection model used throughout RemDo
and is the contract structural commands rely on. The structural outcomes are
detailed in [Note Structure Rules](./note-structure-rules.md).

## Selection states

A selection is always exactly one of:

1. **Caret / inline text range** — the caret, or a text range, inside a single
   note. Typing, inline formatting, and inline delete operate on it. Structural
   commands treat the caret's note (and its subtree) as their target even with
   no visible range.
2. **Note range** — one or more contiguous sibling notes, each selected together
   with its entire subtree.

**Mode switch.** Typing inserts characters only in state 1. As soon as the
selection covers any whole note (state 2), the editor is in structural mode:
keystrokes that would type become no-ops and structural commands take over.
`Esc`, or clicking into a note's text, returns to a caret.

## Whole-note snapping

A selection can never partially cross a note boundary. The moment a text
selection extends beyond one note's content, it snaps to a note range.

## The selection ladder

A note range cannot grow by single rows; it grows and shrinks along a
single ordered ladder whose every rung is itself a legal whole-subtree
selection. Its defining property is **symmetric
grow/shrink**: pressing the opposite direction *exactly inverts* the previous
step.

The ladder is anchored and replayable:

- **One anchor.** The note where the selection started — by `Shift+Up/Down` or
  `Cmd/Ctrl+A`. It is fixed for the life of the ladder and is cleared only when
  the selection collapses to a caret. Losing editor focus does not collapse it;
  the ladder survives blur and refocus.
- **Rungs.** Each step is a semantic instruction, not a stored range, so the
  selection is the anchor plus the current rungs re-resolved against the live
  tree. The recurrence is:
  1. the anchor note's own [content text](./concepts.md#definitions), selected
     inline — a distinct first rung (skipped when that text is empty, so the
     first press lands on rung 2);
  2. the anchor note plus its subtree — the first structural rung,
     direction-neutral;
  3. one more contiguous sibling (with its subtree) in the sweep direction;
  4. when siblings in that direction are exhausted, the parent note (with its
     subtree), then resume sibling steps at the parent's level;
  5. repeat to the document root (or the [zoom](./zoom.md) boundary). Hoisting
     stops at the deepest note still inside the zoom root; the zoom root itself
     is never a rung.

Direction and reversal:

- The first structural rung is direction-neutral. The press that first extends
  past the anchor's subtree establishes the sweep direction.
- Pressing the sweep direction pushes the next rung; pressing the opposite
  direction pops the top rung — exactly the rung that was last pushed. Because a
  `Cmd/Ctrl+A` sibling rung adds the whole sibling group at once, one reverse
  press retracts that whole group.
- Contraction bottoms out at the anchor and then collapses to the caret, which
  fully resets the ladder. From that bare caret, the next `Shift+Arrow` starts a
  fresh ladder in the pressed direction — `Up` grows up, `Down` grows down.
- A press that would extend past the document or zoom boundary is a no-op.
- `Cmd/Ctrl+A` is direction-neutral: it only ever grows the ladder outward (its
  sibling rung covers the whole sibling group either way), so it never inherits
  a prior `Shift+Arrow` sweep direction and never biases the next `Shift+Arrow`.

Because the selection is replayed from intent, a collaboration edit reshapes it
in place where possible; the disturbance tiers are defined in
[Collaboration reshaping](#collaboration-reshaping).

## Input bindings

| Input | Effect |
| ----- | ------ |
| `Shift+Left/Right` | Inline-only text selection inside the active note; a no-op at the note boundary. |
| `Shift+Up/Down` | Walk the selection ladder one note at a time in that direction (push the next rung, or pop on reversal). |
| `Cmd/Ctrl+A` | Grow the same ladder outward one rung per press (direction-neutral), adding the whole sibling group of a sibling rung at once. |
| `Shift+Click` | Extend to the clicked note, producing a contiguous note range; the anchor is the click origin and the resulting range seeds the ladder so later `Shift+Up/Down` can pop it. |
| Drag | Highlights text until it crosses a note boundary, then snaps to whole notes. |
| Long-press (touch) | Enters caret selection; dragging handles behaves like text selection until it crosses a boundary, then snaps to whole notes. |
| `Esc` | Collapses any note range to a caret without changing the document. |
| Unmodified Arrow / `Home` / `End` / `Page` keys | Collapse a note range and place the caret at the corresponding edge (start/end or top/bottom) so typing resumes there. |
| `Tab` / `Shift+Tab` | Indent / outdent the selection — see [Note Structure Rules](./note-structure-rules.md). |
| `Enter` | Caret mode: see [Insertion](./insertion.md). Structural mode: no-op. |

## Collaboration reshaping

The ladder stores intent, so a disturbance — a remote edit, or an undo/redo
(which is itself a document edit, never a ladder step) — is graded by how much
it perturbs the replay, evaluated from the anchor outward:

1. Anchor and rungs still resolve → the selection re-resolves and follows the new
   shape, including subtree growth/shrink of swept notes. No visible disruption.
2. A rung no longer resolves (its target was deleted, or re-parented so the rung
   can no longer reach it) → the ladder truncates at that rung and drops every
   rung above it, keeping the rungs below. A deleted swept sibling usually does
   *not* truncate: the sibling step simply hoists to the parent instead (tier 1),
   so truncation happens only when a rung can neither advance nor hoist (for
   example at the document or zoom boundary).
3. The anchor note no longer exists → the selection collapses to a caret near
   the former anchor. (An anchor that still exists but moved is not gone; the
   ladder re-replays from its new location.)

[Folding](./folding.md) defines what happens when folding hides the active
selection.

## Command compatibility

| Selection state | Allowed operations |
| --------------- | ------------------ |
| Caret / inline text range | Typing, inline formatting, inline delete/backspace, toggle checked (per [List Types](../../openspec/specs/list-types/spec.md)); structural commands act on the caret's note and subtree. |
| Note range | Indent/outdent, reorder, duplicate, convert note type, delete, copy/paste, toggle checked, and other structural commands, always executed in document order. |

Clipboard behavior for note ranges and inline ranges is defined in
[Clipboard](./clipboard.md).
