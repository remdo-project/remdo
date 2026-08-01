# Selection

RemDo uses a cursor-driven selection model throughout the outliner, and
structural commands rely on it.

## Selection states

A **selection region** is an independently selectable inline-editing surface:
an [editor note](./note-model.md#note-kinds)'s content in a note row or
[view header](./view-header.md), its [body](./body.md), or the
[document root](./note-model.md#definitions)'s editable view header. An editor
note's content and its body are separate selection regions.

A selection is always exactly one of:

1. **Caret selection** — a collapsed caret inside one selection region.
2. **Inline text selection** — a non-collapsed text range inside one selection
   region. Selecting all text in that region remains inline; textual
   coverage does not make a selection structural.
3. **Structural selection** — one or more notes selected as structural units,
   each together with its entire [subtree](./note-model.md#definitions).

The **focus note** is the editor note containing a caret or inline text
selection's focus endpoint, or the editor note at a structural selection's
focus edge. [Body](./body.md#selection-and-structural-targeting) defines how a
focus inside a body maps to its owning editor note. A selection in the document
root's view header has no focus note.

**Mode switch.** Typing inserts characters only in states 1 and 2. In state 3,
the editor is in structural mode: keystrokes that would type become no-ops and
structural commands take over. `Esc`, or clicking into a note's text, returns
to a caret.

## Note ranges

A **note range** is one or more contiguous sibling notes, each together with
its entire subtree. It is the shared operand used by structural commands, not a
selection kind, and a one-note range is valid.

A structural selection has a **selected note range**. A structural command
operates on a **target note range**, which it may resolve from that selected
range or from a non-structural selection as defined by the command. Use the
qualified forms where the source matters; otherwise, **note range** refers to
the common structure.

## Whole-note snapping

A selection can never partially cross a note boundary. The moment a text
selection extends beyond one note's content, it becomes a structural selection
whose selected note range covers the crossed notes.

## The selection ladder

The selection ladder applies only to a selection with a focus note outside the
view header. In a view header, `Shift+Arrow` stays within the header's selection
region and `Cmd/Ctrl+A` selects all header content; neither input creates a
structural selection.

The selection cannot grow by single rows; it grows and shrinks along a single
ordered ladder whose every structural rung has a legal selected note range.
Its defining property is **symmetric
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
  1. the anchor note's own [content text](./note-model.md#definitions), selected
     inline — a distinct first rung (skipped when that text is empty, so the
     first press lands on rung 2);
  2. the anchor note plus its subtree — the first structural rung,
     direction-neutral;
  3. one more contiguous sibling (with its subtree) in the sweep direction;
  4. when siblings in that direction are exhausted, the parent note (with its
     subtree), then resume sibling steps at the parent's level;
  5. repeat to the [document root](./note-model.md#definitions) (or the
     [zoom boundary](./zoom.md#definitions)). Hoisting stops at the deepest note
     still inside the zoom root; the zoom root itself is never a rung.

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
| `Shift+Left/Right` | Extends an inline text selection inside its selection region; a no-op at the region boundary. |
| `Shift+Up/Down` | With a focus note, walk the selection ladder one note at a time in that direction (push the next rung, or pop on reversal). |
| `Cmd/Ctrl+A` | With a focus note, grow the same ladder outward one rung per press (direction-neutral), adding the whole sibling group of a sibling rung at once. |
| `Shift+Click` | Extend to the clicked note, producing a structural selection with a contiguous selected note range; the anchor is the click origin and the resulting range seeds the ladder so later `Shift+Up/Down` can pop it. |
| Drag | Highlights text until it crosses a note boundary, then snaps to whole notes. |
| Long-press (touch) | Enters caret selection; dragging handles behaves like text selection until it crosses a boundary, then snaps to whole notes. |
| `Esc` | Collapses any structural selection to a caret without changing the document. |
| Unmodified Arrow / `Home` / `End` / `Page` keys | Collapse a structural selection and place the caret at the corresponding edge (start/end or top/bottom) so typing resumes there. |
| `Tab` / `Shift+Tab` | Indent / outdent the selection — see [Indentation](./indentation.md). |
| `Enter` | Caret selection: see [Insertion](./insertion.md). Structural selection: no-op. |

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
| Caret selection | Typing, inline formatting, inline delete/backspace, and toggle checked (per [List types](./list-types.md#toggling)); structural commands may resolve a one-note target note range as defined by the command. |
| Inline text selection | Inline formatting, inline delete/backspace, and toggle checked; structural commands define whether and how the selection resolves to a target note range. |
| Structural selection | Indent/outdent, reorder, duplicate, convert note type, delete, copy/paste, toggle checked, and other structural commands operate on its selected note range in [document order](./note-model.md#definitions). |

Clipboard behavior for structural selections and inline text selections is
defined in [Clipboard](./clipboard.md).
