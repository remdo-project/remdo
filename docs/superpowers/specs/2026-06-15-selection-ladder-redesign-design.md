# Selection Ladder Redesign — Design Spec

Date: 2026-06-15 (model converged 2026-06-16)
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

### Why the ladder is forced, not chosen

A flat anchor+focus model (the text-editor default) is **disqualified for an
outliner**, and this is the principle the whole design rests on.

A structural selection must always be a contiguous run of **whole notes, each
including its entire subtree** ([Note Structure Rules](../../outliner/note-structure-rules.md)
"Subtree Atomic Move"); every structural command (indent, outdent, reorder,
delete) assumes it. A flat focus extends by document-order *position* (the next
visible row), but the outliner requires extension by whole *subtrees*. Those
coincide only in a flat document. The moment a selected note has children
below the focus edge, flat extension yields a parent without its descendants —
an illegal selection, and one that then feeds `Tab`/reorder/etc., propagating
the breakage into structural operations.

So the extension unit cannot be a flat row; it must be a whole subtree. This
forces a hierarchy-aware ladder. The organizing principle that follows:

> **The rungs are the legal selection states.** Each rung is, by construction, a
> contiguous whole-subtree run, so there is no representable illegal
> intermediate selection. The test for any rule is simply: *does every rung
> remain a contiguous whole-subtree run?*

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

**One ladder, two speeds.** `Cmd/Ctrl+A` and `Shift+Up/Down` walk the *same*
rungs from the *same* anchor; they differ only in step size. `Cmd/Ctrl+A`
advances one rung kind per press and collapses the repeatable sibling step into
"all remaining siblings at this level at once" (one slab = one rung).
`Shift+Up/Down` steps one sibling at a time. Whichever gesture starts the
selection sets the anchor; the other can continue or reverse on the same stack.
The inline-body rung (rung 1) and the empty-body skip apply identically to both.

### Anchor and direction rules

- **One anchor.** The anchor is fixed for the life of the ladder. It is set when
  structural selection begins from a caret and cleared only when the selection
  collapses back to a caret.
- **First press is direction-neutral.** From a caret, the first press selects the
  anchor note (inline body, then note+subtree). Direction does not matter yet.
- **Direction is established by the first sweep.** The press that first extends
  past the anchor's subtree sets the sweep direction (up or down).
- **Same direction pushes; opposite direction pops.** Reversing pops the top
  rung and re-replays — exact, never re-derived. A slab rung pushed by
  `Cmd/Ctrl+A` is one rung, so one reverse press retracts the whole slab.
- **The anchor is the floor; contraction stops there.** Popping bottoms out at
  the anchor (rung 1, or rung 2 for an empty body) and then collapses to the
  caret; once at the caret, further presses in the same direction are no-ops.
  There is no "flip" — to grow the other way the user presses the other
  direction key, which starts a fresh ladder. (This is the VS Code / JetBrains
  shrink convention; the earlier flip idea is dropped because it re-anchors
  mid-gesture and has no precedent.)
- **Boundary push is a no-op.** A push that would extend past the document (or
  zoom) boundary does nothing. So holding one direction to the boundary and then
  pressing the other direction shrinks normally; the only no-op corner case is
  when the first push was already a boundary no-op (the ladder already covers
  the whole document).

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
3. **A rung no longer resolves** (its target was deleted, or re-parented so the
   rung can no longer reach it). Evaluating rungs from the anchor outward,
   truncate at the first rung that fails and drop every rung above it, keeping
   the rungs below. (This is well-defined even when the break is mid-stack: a
   higher rung that would independently resolve is still dropped, so the stack
   never has a hole.)
4. **The anchor note no longer exists.** Collapse to a caret near the former
   anchor. An anchor that still exists but moved is *not* gone — "gone" means the
   note id no longer resolves; a moved anchor re-replays from its new location
   (tier 1/2).

Tiers 1–2 are the design target and fall out of the model for free. **Tiers 3–4
are the target but may be implemented coarser at first** (initial implementation
may collapse to a caret on any rung/anchor loss). This deferral is tracked in
[`docs/todo.md`](../../todo.md).

This is not a new problem the stack introduces: the current geometry-based code
is invalidated by remote edits just as easily. The stack makes the policy
explicit and gives one mechanism for both expansion and recovery.

## Naming

- **Selection ladder** — the ordered sequence of rungs.
- **Rung** — one semantic expansion step; every rung is a legal whole-subtree
  selection.
- **Anchor** — the fixed note where the selection started (by either gesture).
- **Symmetric grow/shrink** — the invariant that the opposite key exactly
  inverts the previous step (the user's "clear order").

## Decisions

Confirmed with the user during brainstorming on 2026-06-15 and refined in a
follow-up discussion on 2026-06-16.

1. **The ladder is forced by atomicity, not chosen.** A flat anchor+focus model
   is disqualified for an outliner; the extension unit must be a whole subtree,
   so the ladder is hierarchy-aware. The rungs are the legal selection states —
   no illegal intermediate selection is representable.
2. **Core model = expansion-history stack of intent.** Selection =
   `replay(anchor, stack)` against the live tree; rungs store intent, not
   geometry.
3. **One ladder, two speeds, one anchor.** `Cmd/Ctrl+A` and `Shift+Up/Down` walk
   the same rungs from the same anchor; `Cmd/Ctrl+A` jumps a rung per press
   (whole slab at once), arrows step one sibling at a time. The anchor is the
   note where the selection started, by *either* gesture, fixed until full
   collapse.
4. **Inline body is rung 1 on both gestures** (required for `Cmd/Ctrl+A`, kept on
   arrows for coherence). Empty bodies skip it on both, so the first press lands
   on note+subtree. The first structural rung (note+subtree) is
   direction-neutral; the first sweep past it sets the sweep direction.
5. **Contraction stops at the anchor — no flip.** Popping bottoms out at the
   anchor and collapses to the caret; further same-direction presses are no-ops.
   To grow the other way the user presses the other direction key. (Replaces the
   earlier flip-past-empty idea, which re-anchored mid-gesture.)
6. **Slab reversal pops the whole slab.** A `Cmd/Ctrl+A` sibling rung is one
   rung, so one reverse press retracts the whole slab — the literal inverse of
   the push.
7. **Caret is an implicit single-note structural target.**
8. **Pointer selections seed the ladder**: anchor = click/drag origin; the range
   is reproduced as a synthesized rung set so keyboard reversal pops
   nearest-to-anchor last.
9. **Collaboration tiers:** spec the ideal (auto-reshape → truncate → collapse);
   truncation is anchor-outward (drop the first failing rung and everything
   above it); "anchor gone" means its note id no longer resolves (a moved anchor
   re-replays). Hard tiers 3–4 may ship coarse first (see `docs/todo.md`).
10. **The ladder is not on the undo stack.** Undo/redo are document edits handled
    as disturbances; growing/shrinking the ladder is not itself undoable.

## Open questions

These remain genuinely open for the user; the decisions above resolved the rest.

- **Persistence of the stack across blur/refocus.** Whether the rung stack
  survives the editor losing and regaining focus, or resets to caret. Proposed
  default: reset on blur (the stack is ephemeral UI state), matching most
  editors; the implementation plan's reset-on-collapse subsumes this in
  practice. Confirm if a different lifetime is wanted.
- **Folding-hidden selection.** Folding owns the rule that hiding the active
  selection collapses it to the folded ancestor (`folding.md`); under the stack
  model this is a tier-3 disturbance. The selection doc points to folding for it.
  Zoom only constrains *expansion* to the zoom root and does not define a
  selection-hiding collapse, so the doc no longer attributes that rule to zoom.

## References

- Structural selection audit and industry research conducted 2026-06-15
  (anchor+edge vs expand/shrink-stack models; VS Code/JetBrains shrink is
  history-based; OS HIGs endorse fixed-anchor reversal for plain text).
- [`docs/outliner/note-structure-rules.md`](../../outliner/note-structure-rules.md) — Subtree Atomic Move.
- [`docs/outliner/clipboard.md`](../../outliner/clipboard.md) — cut/copy/paste over note ranges.
