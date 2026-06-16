import type { ListItemNode } from '@lexical/list';
import { $getNodeByKey } from 'lexical';

import { getPreviousContentSibling } from '#client/editor/outline/list-structure';

import type { BoundaryMode } from './apply';
import { resolveContentBoundaryPoint } from './caret';
import { isEmptyNoteBody } from './note-body';
import { getNextContentSibling, getParentContentItem, getSubtreeTail, isContentDescendantOf } from './tree';

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

export type ProgressivePlan =
  | {
      type: 'inline';
      itemKey: string;
    }
  | {
      type: 'range';
      startKey: string;
      endKey: string;
      startMode: BoundaryMode;
      endMode: BoundaryMode;
    };

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

export function $createInlinePlan(item: ListItemNode): ProgressivePlan | null {
  if (isEmptyNoteBody(item)) {
    return null;
  }
  return $hasInlineBoundary(item) ? { type: 'inline', itemKey: item.getKey() } : null;
}

export function $createSubtreePlan(item: ListItemNode): ProgressivePlan | null {
  const tail = getSubtreeTail(item);
  const isLeaf = tail.getKey() === item.getKey();
  return {
    type: 'range',
    startKey: item.getKey(),
    endKey: tail.getKey(),
    startMode: 'content',
    endMode: isLeaf ? 'content' : 'subtree',
  };
}

export function $hasInlineBoundary(item: ListItemNode): boolean {
  return Boolean(resolveContentBoundaryPoint(item, 'start') && resolveContentBoundaryPoint(item, 'end'));
}

/**
 * Replay a rung stack against the live Lexical tree to produce a ProgressivePlan.
 *
 * Walks the stack in order from the anchor item, updating the current range
 * state for each rung. Returns null if any rung cannot resolve (boundary
 * reached or target missing).
 *
 * @param anchorItem  The anchor content ListItemNode.
 * @param stack       Ordered list of rungs to replay.
 * @param boundaryKey Optional zoom boundary: never extend outside that root's subtree.
 */
export function $replayLadder(
  anchorItem: ListItemNode,
  stack: Rung[],
  boundaryKey: string | null = null
): ProgressivePlan | null {
  const boundaryRoot = boundaryKey ? $getNodeByKey<ListItemNode>(boundaryKey) : null;

  // contextItem tracks the "active level" item for hoist/sibling navigation.
  // It starts at the anchor and shifts up when a hoist rung is processed.
  let contextItem: ListItemNode = anchorItem;

  // startHead/endHead are the content items at the range boundaries (pre-subtree-tail).
  // null until the first range-producing rung is processed.
  let startHead: ListItemNode | null = null;
  let endHead: ListItemNode | null = null;

  for (const rung of stack) {
    if (rung.kind === 'inline') {
      const plan = $createInlinePlan(anchorItem);
      if (plan) {
        return plan;
      }
      // Fall through: empty body — treat this as a no-op and continue to next rung.
      continue;
    }

    if (rung.kind === 'subtree') {
      startHead = contextItem;
      endHead = contextItem;
      continue;
    }

    if (rung.kind === 'hoist') {
      const parent = getParentContentItem(contextItem);
      if (!parent) {
        return null;
      }
      if (boundaryRoot && !isContentDescendantOf(parent, boundaryRoot) && parent.getKey() !== boundaryRoot.getKey()) {
        return null;
      }
      contextItem = parent;
      startHead = parent;
      endHead = parent;
      continue;
    }

    if (rung.kind === 'sibling') {
      if (rung.direction === 'down') {
        const boundary = endHead ?? contextItem;
        const next = getNextContentSibling(boundary);
        if (!next) {
          return null;
        }
        if (boundaryRoot && !isContentDescendantOf(next, boundaryRoot) && next.getKey() !== boundaryRoot.getKey()) {
          return null;
        }
        endHead = next;
      } else {
        // direction === 'up'
        const boundary = startHead ?? contextItem;
        const prev = getPreviousContentSibling(boundary);
        if (!prev) {
          return null;
        }
        if (boundaryRoot && !isContentDescendantOf(prev, boundaryRoot) && prev.getKey() !== boundaryRoot.getKey()) {
          return null;
        }
        startHead = prev;
      }
      continue;
    }
  }

  // Build the final plan from startHead/endHead.
  if (!startHead || !endHead) {
    return null;
  }

  const tail = getSubtreeTail(endHead);
  const isLeaf = tail.getKey() === endHead.getKey();
  return {
    type: 'range',
    startKey: startHead.getKey(),
    endKey: tail.getKey(),
    startMode: 'content',
    endMode: isLeaf ? 'content' : 'subtree',
  };
}
