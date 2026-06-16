# Selection Ladder Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the geometry-reconstructing structural-selection state machine
with an anchored stack of replayable rungs, so reversing direction pops the
exact previous step and collaboration edits reshape the selection in place.

**Architecture:** Structural selection becomes `anchor + rung-stack`, where each
rung is a semantic instruction (`inline`, `subtree`, `sibling`, `hoist`). The
current selection is derived by replaying the stack against the live tree. The
plugin's existing `registerUpdateListener` → `$computeOutlineSelectionSnapshot`
flow already recomputes selection on every editor update, so it is the natural
place to re-replay after collaboration edits. `progressive.ts` shrinks from
"compute-and-guess-on-reverse" to "push/pop + replay".

**Tech Stack:** TypeScript, Lexical (`@lexical/list`), React, Vitest unit +
collab tests. The authoritative behavior contract is
`docs/outliner/selection.md`; design rationale is in
`docs/superpowers/specs/2026-06-15-selection-ladder-redesign-design.md`.

---

## Context the implementer needs

- **Read first:** `docs/outliner/selection.md` (the contract), the design spec
  above, and `docs/outliner/concepts.md` (note/subtree model). Inspect Lexical
  sources under `data/.vendor/lexical`, never `node_modules`.
- **The existing behavioral suite is the regression contract.**
  `tests/unit/selection.spec.ts` already asserts the target ladder behavior:
  symmetric shrink on reversal (`shrinks toward the anchor when reversing
  Shift+Arrow direction`, line ~667), anchor-stable reversal after `Cmd/Ctrl+A`
  (line ~729), hoisting (line ~781), boundary no-ops (lines ~637/652), and zoom
  clamping (lines ~751/766). **These must stay green throughout the refactor.**
  Do not weaken them.
- **Key files (current):**
  - `src/client/editor/outline/selection/progressive.ts` — plan computation, the
    state to replace. 725 lines.
  - `src/client/editor/outline/selection/resolve.ts` — `ProgressiveSelectionState`
    type, point→item resolution, `inferPointerProgressionState`.
  - `src/client/editor/outline/selection/snapshot.ts` —
    `$computeOutlineSelectionSnapshot`, the per-update recompute.
  - `src/client/editor/plugins/SelectionPlugin.tsx` — wiring: `progressionRef`,
    command handlers, the update listener.
  - `src/client/editor/outline/selection/tree.ts` — tree helpers
    (`getSubtreeTail`, `getContentSiblingsForItem`, `getParentContentItem`,
    etc.). Reuse these; do not reimplement traversal.
  - `src/client/editor/outline/selection/heads.ts` —
    `getContiguousSelectionHeads`.
- **Scoped checks during iteration:** `pnpm run typecheck`; `pnpm run lint:code
  -- <paths>`; `pnpm run test:unit:full tests/unit/selection.spec.ts -t
  "<name>"`. Collab: `pnpm run test:collab:full tests/unit/collab/<file> -t
  "<name>"`.
- **Final checks before handing back:** `pnpm run lint`, `pnpm run test:unit`,
  and `pnpm run test:collab` (collab risk is high — this touches
  selection/sync paths).
- **Commit cadence:** commit after each task's tests pass. End commit messages
  with the `Co-Authored-By` trailer per `AGENTS.md`.

## Decomposition note (no behavior change in Tasks 1–4)

Tasks 1–4 introduce the rung model and reroute the keyboard/`Cmd+A` paths
through it while keeping the existing unit suite green — a pure refactor. Task 5
adds the new collaboration-reshape behavior (genuinely new, TDD with failing
tests first). Task 6 handles pointer-seeded ladders. Task 7 cleans up dead code.
Keep this order: do not start Task 5 until 1–4 are green.

---

## File Structure

- **Create** `src/client/editor/outline/selection/rungs.ts` — the rung type
  (`Rung`), the anchored ladder state (`LadderState`), and pure functions
  `pushStep`, `popStep`, and `$replayLadder(anchor, stack)` → range plan. One
  responsibility: the ladder algebra. No Lexical command/IO here beyond reading
  the tree via `tree.ts` helpers.
- **Modify** `src/client/editor/outline/selection/progressive.ts` — re-express
  `$computeDirectionalPlan` / `$computeProgressivePlan` as thin adapters over
  `rungs.ts` (push for same-direction, pop for reverse, replay to produce the
  range). Delete `inferSiblingStage`, `$buildDirectionalShrinkPlan`, and the
  `stage`/`repeatStage` reconstruction once callers no longer need them.
- **Modify** `src/client/editor/outline/selection/resolve.ts` — replace
  `ProgressiveSelectionState` (`{anchorKey, stage, locked, lastDirection}`) with
  the ladder state shape (`{anchorKey, stack, direction}`); update
  `inferPointerProgressionState` to seed a stack (Task 6).
- **Modify** `src/client/editor/outline/selection/snapshot.ts` — re-replay the
  ladder on every update; apply the collaboration-reshape tiers (Task 5).
- **Modify** `src/client/editor/plugins/SelectionPlugin.tsx` — store `ladderRef`
  instead of `progressionRef`; push/pop on directional command; reset on
  collapse.
- **Test** `tests/unit/selection.spec.ts` (existing; keep green; add
  stop-at-anchor case), `tests/unit/internal/selection-rungs.spec.ts` (new),
  `tests/unit/collab/selection-reshape.collab.spec.tsx` (new).

---

### Task 1: Rung model and pure ladder algebra

**Files:**

- Create: `src/client/editor/outline/selection/rungs.ts`
- Test: `tests/unit/internal/selection-rungs.spec.ts`

- [ ] **Step 1: Write the failing test** for the rung type and push/pop against
  a fixture tree.

```text
// tests/unit/internal/selection-rungs.spec.ts
import { describe, expect, it } from 'vitest';
import { emptyLadder, pushStep, popStep } from '#client/editor/outline/selection/rungs';

describe('selection rungs (pure algebra)', () => {
  it('starts empty and pushes the first structural rung as a neutral subtree', () => {
    const l0 = emptyLadder('anchorKey');
    expect(l0.stack).toEqual([]);
    const l1 = pushStep(l0, 'down'); // inline body
    const l2 = pushStep(l1, 'down'); // note + subtree (direction-neutral)
    expect(l2.stack.at(-1)).toMatchObject({ kind: 'subtree' });
    expect(l2.direction).toBeNull(); // not set until the first sweep
  });

  it('pop is the exact inverse of push', () => {
    const l = pushStep(pushStep(pushStep(emptyLadder('a'), 'down'), 'down'), 'down');
    expect(popStep(l)).toEqual(pushStep(pushStep(emptyLadder('a'), 'down'), 'down'));
  });

  it('records sweep direction on the first sweep step', () => {
    let l = pushStep(pushStep(emptyLadder('a'), 'down'), 'down'); // inline, subtree
    l = pushStep(l, 'down'); // first sweep -> direction down
    expect(l.direction).toBe('down');
    l = popStep(popStep(popStep(l))); // back to empty
    expect(l.stack).toEqual([]);
    expect(l.direction).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:unit:full tests/unit/internal/selection-rungs.spec.ts`
Expected: FAIL — `rungs` module / exports not found.

- [ ] **Step 3: Implement `rungs.ts`** with the pure algebra. Keep it
  tree-agnostic: push/pop only manipulate the stack and `direction`; replay
  (Task 2) consumes the tree.

```text
// src/client/editor/outline/selection/rungs.ts
export type Direction = 'up' | 'down';

export type Rung =
  | { kind: 'inline' }
  | { kind: 'subtree' } // anchor note + subtree; direction-neutral
  | { kind: 'sibling'; direction: Direction }
  | { kind: 'hoist' };

export interface LadderState {
  anchorKey: string;
  stack: Rung[];
  direction: Direction | null; // sweep direction, set on first sweep step
}

export function emptyLadder(anchorKey: string): LadderState {
  return { anchorKey, stack: [], direction: null };
}

// The next rung kind for a push, given the current stack depth.
function nextKind(depth: number): Rung['kind'] {
  if (depth === 0) return 'inline';
  if (depth === 1) return 'subtree';
  // depth >= 2: structural sweep — replay decides sibling-vs-hoist by tree shape.
  return 'sibling';
}

export function pushStep(state: LadderState, direction: Direction): LadderState {
  const kind = nextKind(state.stack.length);
  const rung: Rung = kind === 'sibling' ? { kind, direction } : ({ kind } as Rung);
  const sweep = kind === 'sibling' || kind === 'hoist';
  return {
    anchorKey: state.anchorKey,
    stack: [...state.stack, rung],
    direction: sweep ? direction : state.direction,
  };
}

export function popStep(state: LadderState): LadderState {
  const stack = state.stack.slice(0, -1);
  const lastSweep = [...stack].reverse().find((r) => r.kind === 'sibling');
  return {
    anchorKey: state.anchorKey,
    stack,
    direction: lastSweep && lastSweep.kind === 'sibling' ? lastSweep.direction : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:unit:full tests/unit/internal/selection-rungs.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm run typecheck
git add src/client/editor/outline/selection/rungs.ts tests/unit/internal/selection-rungs.spec.ts
git commit -m "feat(selection): add pure rung-ladder algebra (push/pop)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Replay a ladder against the live tree into a range plan

**Files:**

- Modify: `src/client/editor/outline/selection/rungs.ts`
- Test: `tests/unit/internal/selection-rungs.spec.ts`

The replay function turns `(anchor, stack, direction)` into the same
`ProgressivePlan` shape `progressive.ts` already applies (`{ type: 'range',
startKey, endKey, startMode, endMode }` or `{ type: 'inline', itemKey }`). Reuse
`tree.ts` helpers — do not write new traversal.

- [ ] **Step 1: Write the failing test** using a fixture loaded through the
  existing harness. Mirror the expectations already encoded in
  `tests/unit/selection.spec.ts` for `tree-complex`. Follow the fixture-loading
  pattern from `tests/unit/internal/selection-tree.spec.ts`.

```text
// add to tests/unit/internal/selection-rungs.spec.ts
// Build a ladder for note2 in tree-complex and assert replay yields:
//   subtree -> note2 + subtree
//   + sibling(down) -> note2..note3
//   + hoist -> note0's subtree (note0..note2 contiguous run)
// Import $replayLadder from '#client/editor/outline/selection/rungs'.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:unit:full tests/unit/internal/selection-rungs.spec.ts`
Expected: FAIL — `$replayLadder` not exported.

- [ ] **Step 3: Implement `$replayLadder`** in `rungs.ts`. Walk the stack:
  `inline` → inline plan; `subtree` → anchor subtree plan; `sibling` → extend
  one content sibling in `direction` (using
  `getNextContentSibling`/`getPreviousContentSibling` + `getSubtreeTail`); when
  no sibling exists in that direction, treat the step as a `hoist` (ascend via
  `getParentContentItem`, then continue sibling steps at that level), honoring
  the zoom `boundaryKey`. Return `null` for a step that cannot resolve (the
  boundary no-op / collab tier-2 case). Extract the pure plan-builders from
  `progressive.ts` (`$createSubtreePlan`, `$createInlinePlan`, sibling-range
  building) into `rungs.ts` so both files share one implementation (DRY).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:unit:full tests/unit/internal/selection-rungs.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm run typecheck
git add src/client/editor/outline/selection/rungs.ts tests/unit/internal/selection-rungs.spec.ts
git commit -m "feat(selection): replay rung ladder against the live tree into a range plan

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Swap the state type and route the directional path through the ladder

**Files:**

- Modify: `src/client/editor/outline/selection/resolve.ts` (replace
  `ProgressiveSelectionState`)
- Modify: `src/client/editor/outline/selection/progressive.ts`
  (`$computeDirectionalPlan` → push/pop + replay)
- Modify: `src/client/editor/plugins/SelectionPlugin.tsx` (`progressionRef` →
  ladder state)
- Test: `tests/unit/selection.spec.ts` (existing; keep green)

- [ ] **Step 1: Run the existing ladder tests to capture the green baseline.**

Run: `pnpm run test:unit:full tests/unit/selection.spec.ts`
Expected: PASS (baseline before refactor).

- [ ] **Step 2: Replace the state type.** In `resolve.ts`, change
  `ProgressiveSelectionState` to alias `LadderState` from `rungs.ts`, and update
  `INITIAL_PROGRESSIVE_STATE` to `emptyLadder` semantics (anchor `null` until
  set). Update `inferPointerProgressionState`'s return type to the new shape
  (full pointer seeding lands in Task 6; here just keep it compiling by
  returning a single-`subtree`-rung ladder).

- [ ] **Step 3: Rewrite `$computeDirectionalPlan`** to: resolve the anchor item;
  if continuing, `pushStep` for the requested direction when it matches the
  current sweep (or when still below the sweep rungs), else `popStep` when the
  request opposes the current sweep direction; then `$replayLadder` to produce
  the plan. **Stop-at-anchor (no flip):** once the stack is empty (collapsed to
  the caret), a further press in the contract direction is a no-op — it must not
  start a fresh push the other way. The only way to grow after reaching the
  caret is a press in the opposite (grow) direction, which seeds a new ladder.
  Delete `$buildDirectionalShrinkPlan` and `inferSiblingStage` usage from this
  path. Keep `$isDirectionalBoundary` (it gates the no-op) but reimplement it as
  "replay of a hypothetical push returns null".

- [ ] **Step 4: Update `SelectionPlugin.tsx`.** Rename `progressionRef` to
  `ladderRef`, store `LadderState`, and remove `getStoredStage` /
  `$inferSelectionDirection` (direction now lives in the ladder). On
  collapse-to-caret, reset to `emptyLadder`.

- [ ] **Step 5: Run the existing ladder tests; they must still pass.**

Run: `pnpm run test:unit:full tests/unit/selection.spec.ts`
Expected: PASS — same assertions, new mechanism. If a test fails, fix the
implementation (not the test) unless the test encodes the old guess-behavior the
spec deliberately changed; if so, note it for the handoff and update the test to
the spec.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
pnpm run typecheck
pnpm run lint:code -- \
  src/client/editor/outline/selection/progressive.ts \
  src/client/editor/outline/selection/resolve.ts \
  src/client/editor/plugins/SelectionPlugin.tsx
git add -A
git commit -m "refactor(selection): route Shift+Arrow through the rung ladder (push/pop)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Route Cmd/Ctrl+A through the same ladder

**Files:**

- Modify: `src/client/editor/outline/selection/progressive.ts`
  (`$computeProgressivePlan`)
- Test: `tests/unit/selection.spec.ts` (existing; keep green)

- [ ] **Step 1: Confirm the `Cmd/Ctrl+A` tests currently pass.**

Run: `pnpm run test:unit:full tests/unit/selection.spec.ts -t "Cmd"`
Expected: PASS baseline.

- [ ] **Step 2: Rewrite `$computeProgressivePlan`** so each press pushes one
  rung; for a `sibling` rung it collapses the whole remaining sibling slab at
  the level in one step (a replay variant that takes "all remaining siblings in
  the established direction", defaulting to `down` when no sweep direction is
  set yet). Reuse `$replayLadder` with a `slab: true` flag rather than
  duplicating traversal.

- [ ] **Step 3: Run the `Cmd/Ctrl+A` tests; they must still pass.**

Run: `pnpm run test:unit:full tests/unit/selection.spec.ts -t "Cmd"`
Expected: PASS. Also run the reversal-after-`Cmd+A` test (`keeps the anchor when
reversing Shift+Arrow after Cmd/Ctrl+A expansion`) — it asserts a `Cmd+A`-built
ladder pops correctly under `Shift+Arrow`.

- [ ] **Step 4: Run the full selection spec to confirm no regressions.**

Run: `pnpm run test:unit:full tests/unit/selection.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm run typecheck
git add src/client/editor/outline/selection/progressive.ts
git commit -m "refactor(selection): route Cmd/Ctrl+A through the rung ladder slab step

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Collaboration reshape (tiers 1–2 now; truncate/collapse coarse first)

**Files:**

- Modify: `src/client/editor/outline/selection/snapshot.ts` (re-replay on update)
- Test: `tests/unit/collab/selection-reshape.collab.spec.tsx` (new)

This is the genuinely new behavior. The plugin already recomputes on every
update via `registerUpdateListener`; the change is to re-replay the stored
ladder against the new tree instead of re-deriving from selection geometry.

- [ ] **Step 1: Write the failing collab test.** Use the existing collab harness
  pattern from `tests/unit/collab/structural-delete.collab.spec.tsx`. Tier-1/2:
  a structural selection over `note2..note3` exists locally; a remote peer adds
  a child under `note3`; assert the selection re-resolves to still cover
  `note2..note3` *including the new descendant*, with the same anchor. Tier-3: a
  remote peer deletes `note3` (a swept sibling); assert the ladder truncates to
  the deepest still-valid rung (anchor subtree `note2`). Tier-4: a remote peer
  deletes the anchor `note2`; assert the selection collapses to a caret.

```text
// tests/unit/collab/selection-reshape.collab.spec.tsx — sketch; follow the
// structural-delete.collab.spec.tsx setup for two synced editors.
it('reshapes a structural selection when a remote peer grows a swept subtree', async ({ collab }) => {
  // build note2..note3 selection on editor A, add a child under note3 on B,
  // await sync, assert A still structural over note2..note3 + new child, anchor note2.
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `pnpm run test:collab:full tests/unit/collab/selection-reshape.collab.spec.tsx`
Expected: FAIL — selection collapses or mis-resolves under the old geometry
recompute.

- [ ] **Step 3: Implement re-replay in `snapshot.ts`.** When the update is *not*
  progressive-tagged (it came from collaboration/undo/typing rather than our own
  ladder command) and a ladder is active, re-replay `(ladder.anchorKey,
  ladder.stack)`:
  - anchor resolves and replay returns a range → tier 1/2: set that range as the
    structural selection.
  - replay returns null at some rung → tier 3: evaluating rungs anchor-outward,
    keep the longest prefix that resolves (drop the first failing rung and every
    rung above it); re-replay; set that.
  - anchor id no longer resolves → tier 4: reset to `emptyLadder` and collapse
    to a caret near the former anchor (reuse `collapseSelectionToCaret`). A
    moved-but-alive anchor is tier 1–2, not tier 4.

  Coarse fallback is acceptable per the spec/todo: if tier-3 truncation is
  risky, collapse to caret on any replay failure, leave a `// TODO(selection
  reshape tier 3)` pointing at `docs/todo.md`, keep the tier-1/2 test passing,
  and mark the tier-3 test `it.skip` with a comment. Record this choice in the
  handoff.

- [ ] **Step 4: Run the collab test.**

Run: `pnpm run test:collab:full tests/unit/collab/selection-reshape.collab.spec.tsx`
Expected: PASS for tier-1/2 (and tier-3/4 if implemented; otherwise skipped with
a noted reason).

- [ ] **Step 5: Run the local selection suite to confirm no regression.**

Run: `pnpm run test:unit:full tests/unit/selection.spec.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm run typecheck
git add src/client/editor/outline/selection/snapshot.ts tests/unit/collab/selection-reshape.collab.spec.tsx
git commit -m "feat(selection): reshape the ladder on collaboration updates via replay

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Seed the ladder from pointer selections

**Files:**

- Modify: `src/client/editor/outline/selection/resolve.ts`
  (`inferPointerProgressionState` → ladder seeding)
- Test: `tests/unit/selection.spec.ts` (existing pointer tests; keep green —
  esp. `keeps the ladder alive after Shift+Click tweaks to continue with
  Shift+Arrow`, line ~191)

- [ ] **Step 1: Confirm the pointer-continuation test passes today.**

Run: `pnpm run test:unit:full tests/unit/selection.spec.ts -t "keeps the ladder alive"`
Expected: PASS baseline.

- [ ] **Step 2: Implement pointer seeding.** When a pointer/`Shift+Click`
  produces a multi-note range with a shared parent, seed `LadderState` with
  `anchorKey` = the drag/click origin note and a synthesized stack that replays
  to the current range: `[inline?, subtree, sibling×N]` with `direction`
  inferred from which side of the anchor the focus sits. The synthesized stack
  must satisfy `$replayLadder(seed)` equals the current selection, so a
  subsequent `Shift+Arrow` reversal pops the last sibling exactly.

- [ ] **Step 3: Run the pointer tests; they must still pass.**

Run: `pnpm run test:unit:full tests/unit/selection.spec.ts -t "Shift+Click"`
Expected: PASS — including the keyboard-continuation case.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm run typecheck
git add src/client/editor/outline/selection/resolve.ts
git commit -m "feat(selection): seed the rung ladder from pointer selections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Add the stop-at-anchor test and remove dead code

**Files:**

- Modify: `tests/unit/selection.spec.ts` (add stop-at-anchor case)
- Modify: `src/client/editor/outline/selection/progressive.ts` (delete
  now-unused reconstruction)

- [ ] **Step 1: Add the stop-at-anchor test.** From a caret, build down to a
  multi-note range, reverse all the way back to the anchor and caret, then press
  the same reverse direction once more and assert it is a no-op (no flip — the
  ladder does not re-expand the other way).

```text
it('stops at the anchor and does not flip when over-contracting',
  meta({ fixture: 'flat' }), async ({ remdo }) => {
  await placeCaretAtNote(remdo, 'note2');
  await pressKey(remdo, { key: 'ArrowDown', shift: true }); // inline body
  await pressKey(remdo, { key: 'ArrowDown', shift: true }); // note2 subtree
  await pressKey(remdo, { key: 'ArrowDown', shift: true }); // note2..note3
  await pressKey(remdo, { key: 'ArrowUp', shift: true });   // back to note2 subtree
  await pressKey(remdo, { key: 'ArrowUp', shift: true });   // back to inline body
  await pressKey(remdo, { key: 'ArrowUp', shift: true });   // collapse to caret
  await pressKey(remdo, { key: 'ArrowUp', shift: true });   // no-op (no flip)
  expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  // Growing the other way requires the other key:
  await pressKey(remdo, { key: 'ArrowDown', shift: true }); // fresh ladder downward
  expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });
});
```

(Use whatever caret/inline matcher shape `toMatchSelection` already supports in
the suite; the assertion intent is "still at note2, no upward selection".)

- [ ] **Step 2: Run it.**

Run: `pnpm run test:unit:full tests/unit/selection.spec.ts -t "stops at the anchor"`
Expected: PASS (the stop-at-anchor floor is the model's default; this locks it
in and guards against a regression to flip behavior).

- [ ] **Step 3: Delete dead code.** Remove `$buildDirectionalShrinkPlan`,
  `inferSiblingStage`, `getLevelsUpToParent`, `isAncestorOfAnchor`,
  `findChildOnPath`, and any `repeatStage`/`isShrink`/`getStoredStage` plumbing
  now unused. Run knip to confirm no orphaned exports.

Run: `pnpm run knip` (or the project's configured unused-exports check)
Expected: no new unused exports from the selection module.

- [ ] **Step 4: Final verification.**

Run: `pnpm run lint && pnpm run test:unit && pnpm run test:collab`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(selection): drop geometry-reconstruction shrink path; lock stop-at-anchor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** anchor + replayable rungs (Tasks 1–2), symmetric
  grow/shrink via push/pop (Task 3, existing tests), `Cmd/Ctrl+A` slab on the
  same ladder (Task 4), collaboration reshape tiers (Task 5), caret-as-target
  and mode-switch (unchanged behavior, already covered by existing tests),
  stop-at-anchor (Task 7), pointer-seeding open question resolved (Task 6).
- **Deferred per spec/todo:** collab tiers 3–4 may ship as a coarse
  collapse-to-caret first (Task 5 Step 3) — flagged for the handoff. Stack
  lifetime across blur/refocus is not implemented here; default
  reset-on-collapse from Task 3 subsumes blur in practice; confirm with the user
  if a different lifetime is wanted.
- **Type consistency:** `LadderState` / `Rung` / `Direction` are defined in
  Task 1 and reused verbatim in Tasks 2–6; `resolve.ts` aliases
  `ProgressiveSelectionState` to `LadderState` in Task 3 so downstream imports
  keep compiling.
