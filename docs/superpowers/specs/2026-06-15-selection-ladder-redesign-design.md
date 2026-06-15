# Selection Ladder Redesign — Design Spec

Date: 2026-06-15
Status: Approved at the principles level; docs + implementation plan to follow.
Owner: Piotr (review), drafted with Claude.

This spec captures the redesign of RemDo's keyboard-driven structural selection.
It is the durable design record behind the rewrite of
[`docs/outliner/selection.md`](../../outliner/selection.md) and the implementation
plan in [`../plans/2026-06-15-selection-ladder-redesign-plan.md`](../plans/2026-06-15-selection-ladder-redesign-plan.md).

## Problem

Structural selection (the `Shift+Up/Down` and `Cmd/Ctrl+A` "ladder") does not
behave the way the user expects, and the doc/code that describe it are hard to
reason about:

1. **Reversal guesses.** The current implementation (`progressive.ts`) keeps a
   `{anchor, stage, locked, lastDirection}` state and, when the user reverses
   direction, *reconstructs* what to shrink by re-deriving the stage from the
   selection's current geometry (`inferSiblingStage`, `$buildDirectionalShrinkPlan`).
   This re-derivation is the source of the "doesn't feel right" behavior: the
   algorithm guesses intent instead of replaying it.
2. **The doc states the ladder three times** with two incompatible numbering
   schemes (`stage 0/1/2` vs `press 1..5`), and repeats the mode-switch,
   collapse, and subtree-atomic rules across several sections. A structural
   audit found the doc can be roughly halved without losing any contract.

## Goal

A selection model that is **literally undo-like**: expansion and contraction
follow one well-defined ladder, and reversing direction *exactly inverts* the
previous step rather than recomputing it. The user calls this property
"clear order"; we name the invariant **symmetric grow/shrink**.

## Industry grounding

Two dominant models exist for "reverse = give back":

- **Anchor + active edge (linear).** One fixed anchor, one moving focus;
  reversing contracts because the focus walks back toward the anchor.
  Stateless and geometry-derived. This is the OS/HIG standard (macOS, Windows,
  GNOME) for `Shift+Arrow` in plain text, and what RemDo's code half-implements.
- **Expansion-history stack.** Each expansion press is pushed; the opposite
  press pops the exact last step — a literal undo log. Used by VS Code
  (`Shift+Alt+Arrow`) and JetBrains (`Ctrl+W` / `Ctrl+Shift+W`) "expand/shrink
  selection".

The linear model only stays unambiguous when the ladder is a single flat order.
RemDo's ladder is **not** flat: selecting a parent pulls in its whole subtree,
and advancing hoists to ancestors. In a tree, "shrink by one" is *geometrically
ambiguous* (drop the last sibling? un-hoist the parent? drop the deepest
descendant?). That ambiguity is exactly what the current re-derivation code
fights. The expansion-history stack resolves it by recording intent, so the
chosen model is the **stack**.

## Core model

### Selection is rebuilt, never stored

Structural selection state is:

- a single **anchor** — the note where structural selection began; and
- an ordered **stack of rungs**, where each rung is a *semantic step*, not a
  stored geometry.

The current selection at any instant is `replay(anchor, stack)` against the
**live tree**. Every disturbance — a press, the user's own typing, a remote
collaboration edit, undo/redo — is handled by one operation: re-replay the stack
against the current tree. **The expansion algorithm is also the recovery
algorithm.**

### Rungs (the ladder)

Rungs are pushed in this recurrence:

1. **Inline body** — the anchor note's inline content block (skipped if the body
   is empty after trimming).
2. **Note + subtree** — the anchor note together with its entire subtree. This
   is the first structural rung and is **direction-neutral**.
3. **Sibling step** (repeatable) — extend by exactly one contiguous sibling
   (with its subtree) in the established sweep direction.
4. **Hoist** — once siblings in the sweep direction are exhausted, include the
   parent note (and therefore its subtree), then resume sibling steps at the
   parent's level.
5. Repeat sibling-step / hoist up to the document root (or the zoom boundary).

`Cmd/Ctrl+A` pushes one *rung kind* per press but collapses the repeatable
sibling step into "all remaining siblings at this level at once".
`Shift+Up/Down` pushes one sibling at a time. Both walk the same rungs.

### Anchor and direction rules

- **One anchor.** The anchor is fixed for the life of the ladder. It is set when
  structural selection begins from a caret and cleared only when the selection
  collapses back to a caret.
- **First press is direction-neutral.** From a caret, the first press selects the
  anchor note (inline body, then note+subtree). Direction does not matter yet.
- **Direction is established by the first sweep.** The press that first extends
  past the anchor's subtree sets the sweep direction (up or down).
- **Same direction pushes; opposite direction pops.** Reversing pops the last
  rung and re-replays — exact, never re-derived.
- **Flip past empty.** When the stack pops fully back to the caret, the next
  press in the same (now opposite) direction begins a fresh ladder in that
  direction on the same single stack.
- **Boundary press is a no-op.** If a push would extend past the document (or
  zoom) boundary, the press does nothing. Consequently, holding one direction to
  the boundary and then pressing the other direction shrinks normally; the only
  no-op corner case is when the first push was already a boundary no-op (e.g. the
  ladder already covers the whole document).

### Caret is a valid structural target

A bare caret implicitly targets its own note + subtree for structural commands
(indent/outdent, reorder, delete-subtree, etc.). A visible note range is not
required to act on a single note. This resolves a contradiction in the current
doc, where the "Editing vs. Structural Mode" section and the Command
Compatibility table disagreed.

### Editing vs structural mode

Typing inserts characters only while the selection is a caret or inline text
range. As soon as the selection covers any whole note, the editor is in
structural mode: typing and `Enter` become no-ops and only structural commands
respond. `Esc` (or clicking into a note's text) collapses to a caret.

## Collaboration / disturbance handling

Because rungs are replayable intent, a disturbance is graded by how much it
perturbs the replay. Target tiers, cheapest to most disruptive:

1. **Anchor survives, rungs still resolve.** Re-replay; selection follows the new
   shape. Covers the vast majority of remote edits. No visible disruption.
2. **Anchor survives, a rung's target changed shape** (e.g. a swept sibling
   gained a child). Replay still works and the selection naturally grows/shrinks
   to the new subtree. This is the "always adjust to the new shape in the
   expected way" outcome, and it is automatic with intent-based rungs.
3. **A rung's target was deleted or re-parented out.** Truncate the stack at the
   first rung that no longer resolves; keep the rungs below it. Selection
   collapses to the deepest still-valid rung rather than to a caret.
4. **The anchor itself is gone.** Collapse to a caret near the former anchor (or
   the surviving range edge).

Tiers 1–2 are the design target and fall out of the model for free. **Tiers 3–4
are the target but may be implemented coarser at first** (initial implementation
may collapse to a caret on any rung/anchor loss). This deferral is tracked in
[`docs/todo.md`](../../todo.md).

This is not a new problem the stack introduces: the current geometry-based code
is invalidated by remote edits just as easily. The stack makes the policy
explicit and gives one mechanism for both expansion and recovery.

## Naming

- **Selection ladder** — the ordered sequence of rungs.
- **Rung** — one semantic expansion step.
- **Anchor** — the fixed note where structural selection began.
- **Symmetric grow/shrink** — the invariant that the opposite key exactly
  inverts the previous step (the user's "clear order").

## Decisions

Each confirmed with the user during brainstorming on 2026-06-15:

1. **Core model = expansion-history stack** (not linear anchor+edge, not hybrid),
   because subtree/hoist makes contraction geometrically ambiguous.
2. **Rungs store intent, not geometry.** Selection = `replay(anchor, stack)`
   against the live tree.
3. **First structural rung is direction-neutral** (anchor note + subtree);
   direction is set by the first sweep.
4. **Flip-and-re-expand past empty**: popping fully to caret, then pressing the
   same direction again, begins a fresh ladder the other way on one stack.
5. **Caret is an implicit single-note structural target.**
6. **Spec the ideal collab tiers; defer hard tiers 3–4 to todo.**

## Open questions

- **Pointer-driven anchor (`Shift+Click`, drag).** Pointer selection currently
  infers a progression state without a real rung stack
  (`inferPointerProgressionState`). The redesign must define how a
  pointer-created selection seeds the stack so subsequent `Shift+Up/Down`
  reversal still pops correctly. Proposed default: a pointer selection seeds the
  anchor at the click origin and synthesizes the minimal rung set that reproduces
  the current range, so keyboard reversal can pop it. Confirm during
  implementation.
- **Interaction with folding/zoom hiding the active selection.** Folding and
  zoom already specify that hiding the active selection collapses it to the
  folded/visible ancestor. Under the stack model this is a tier-3/4 disturbance
  (a rung target becomes unreachable). The selection doc should point to
  folding/zoom for the collapse rule rather than restating it.
- **Persistence of the stack across blur/refocus.** Whether the rung stack
  survives the editor losing and regaining focus, or resets to caret. Proposed
  default: reset on blur (stack is ephemeral UI state), matching most editors.

## References

- Structural selection audit and industry research conducted 2026-06-15
  (anchor+edge vs expand/shrink-stack models; VS Code/JetBrains shrink is
  history-based; OS HIGs endorse fixed-anchor reversal for plain text).
- [`docs/outliner/note-structure-rules.md`](../../outliner/note-structure-rules.md) — Subtree Atomic Move.
- [`docs/outliner/clipboard.md`](../../outliner/clipboard.md) — cut/copy/paste over note ranges.
