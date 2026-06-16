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
