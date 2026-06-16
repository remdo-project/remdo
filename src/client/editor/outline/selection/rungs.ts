import type { ListItemNode } from '@lexical/list';
import { $getNodeByKey } from 'lexical';

import { getPreviousContentSibling } from '#client/editor/outline/list-structure';

import type { BoundaryMode } from './apply';
import { resolveContentBoundaryPoint } from './caret';
import { isEmptyNoteBody } from './note-body';
import { getContentSiblingsForItem, getNextContentSibling, getParentContentItem, getSubtreeTail, isContentDescendantOf } from './tree';

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
  const rung: Rung = kind === 'sibling' ? { kind, direction } : { kind };
  const sweep = kind === 'sibling' || kind === 'hoist';
  return {
    anchorKey: state.anchorKey,
    stack: [...state.stack, rung],
    direction: sweep ? direction : state.direction,
  };
}

export function popStep(state: LadderState): LadderState {
  const stack = state.stack.slice(0, -1);
  const lastSweep = [...stack].reverse().find((r): r is Extract<Rung, { kind: 'sibling' }> => r.kind === 'sibling');
  return {
    anchorKey: state.anchorKey,
    stack,
    direction: lastSweep ? lastSweep.direction : null,
  };
}

function $createInlinePlan(item: ListItemNode): ProgressivePlan | null {
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

function $hasInlineBoundary(item: ListItemNode): boolean {
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
 * @param slab        When true, a `sibling` rung extends the range all the way to the
 *                    last sibling in its direction at the current level (instead of
 *                    advancing one position). Used by Cmd/Ctrl+A to select the whole
 *                    remaining sibling slab in one press. Hoist behaviour (when no
 *                    sibling exists at the current level) is unchanged.
 */
export function $replayLadder(
  anchorItem: ListItemNode,
  stack: Rung[],
  boundaryKey: string | null = null,
  slab = false
): ProgressivePlan | null {
  const boundaryRoot = boundaryKey ? $getNodeByKey<ListItemNode>(boundaryKey) : null;

  // contextItem tracks the "active level" item for hoist/sibling navigation.
  // It starts at the anchor and shifts up when a hoist rung is processed.
  let contextItem: ListItemNode = anchorItem;

  // startHead/endHead are the content items at the range boundaries (pre-subtree-tail).
  // null until the first range-producing rung is processed.
  let startHead: ListItemNode | null = null;
  let endHead: ListItemNode | null = null;

  const lastRung = stack.at(-1);
  for (const rung of stack) {
    if (rung.kind === 'inline') {
      // The inline rung only produces a selection when it is the terminal rung
      // (the ladder is exactly [inline]); once a structural rung sits above it,
      // the inline body is subsumed by the structural range, so skip it here.
      if (rung === lastRung) {
        const plan = $createInlinePlan(anchorItem);
        if (plan) {
          return plan;
        }
      }
      // Empty body, or a non-terminal inline rung — no-op, continue.
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

    // The only remaining rung kind is 'sibling'. A sweep step advances one
    // position in the sweep direction at the current level (contextItem). If a
    // sibling exists there, extend the range to it and its subtree; otherwise
    // hoist to the parent level and take the parent's whole subtree (the hoist
    // itself is the step). A step that can neither advance nor hoist (past the
    // document/zoom root) is unresolvable.
    //
    // In slab mode the range extends to the LAST sibling in the direction
    // (instead of just one), selecting the entire remaining slab in one press.
    // Hoist behaviour is unchanged.
    const sibling =
      rung.direction === 'down' ? getNextContentSibling(contextItem) : getPreviousContentSibling(contextItem);

    const withinBoundary = (item: ListItemNode): boolean =>
      !boundaryRoot || isContentDescendantOf(item, boundaryRoot) || item.getKey() === boundaryRoot.getKey();

    if (slab) {
      // Slab mode: extend the range to ALL siblings at the current level
      // (first to last), advancing contextItem to the last one. This selects
      // the entire sibling group in one press, regardless of sweep direction.
      //
      // Hoist (fall through) when either:
      //   - There are no siblings at this level (only one item in the list), or
      //   - The range already covers the full slab (detected by startHead/endHead
      //     already pinned to first/last), meaning a previous slab rung consumed
      //     this level. The next rung should escalate to the parent.
      const allSiblings = getContentSiblingsForItem(contextItem).filter(withinBoundary);
      const firstSib = allSiblings[0];
      const lastSib = allSiblings.at(-1);
      const alreadyFullSlab =
        firstSib &&
        lastSib &&
        startHead?.getKey() === firstSib.getKey() &&
        endHead?.getKey() === lastSib.getKey();
      if (firstSib && lastSib && allSiblings.length > 1 && !alreadyFullSlab) {
        startHead = firstSib;
        endHead = lastSib;
        contextItem = lastSib;
        continue;
      }
      // Single-item sibling list or already covering the full slab: fall through to hoist.
    } else if (sibling && withinBoundary(sibling)) {
      contextItem = sibling;
      if (rung.direction === 'down') {
        endHead = sibling;
      } else {
        startHead = sibling;
      }
      continue;
    }

    const parent = getParentContentItem(contextItem);
    if (!parent || !withinBoundary(parent)) {
      return null;
    }
    contextItem = parent;
    startHead = parent;
    endHead = parent;
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
