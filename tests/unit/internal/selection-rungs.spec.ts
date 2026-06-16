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
