import type { ListItemNode } from '@lexical/list';
import type { Point } from 'lexical';

import { $getListItemByKey, getPreviousContentSibling } from '#client/editor/outline/list-structure';

import { resolveContentBoundaryPoint } from './caret';
import { isEmptyNoteBody } from './note-body';
import { getContentSiblingsForItem, getNextContentSibling, getParentContentItem, isContentDescendantOf } from './tree';

export type Direction = 'up' | 'down';

export type Rung =
  | { kind: 'inline' }
  | { kind: 'subtree' } // anchor note + subtree; direction-neutral
  | { kind: 'sibling'; direction: Direction | null }; // null selects the whole sibling group; exhaustion hoists

export interface InlineSelectionOrigin {
  anchor: Pick<Point, 'key' | 'offset' | 'type'>;
  focus: Pick<Point, 'key' | 'offset' | 'type'>;
  focusAtLineEnd?: boolean;
}

export interface LadderState {
  anchorKey: string;
  stack: Rung[];
  // The last directional growth, preserved during contraction. Select All
  // clears it so either arrow can grow before a reversal contracts the ladder.
  direction: Direction | null;
  entrySelection?: InlineSelectionOrigin;
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
    };

export function emptyLadder(anchorKey: string): LadderState {
  return { anchorKey, stack: [], direction: null };
}

// A ladder is structural when its stack carries any non-inline rung
// (subtree / sibling / hoist). An empty stack, or an inline-only stack, is not
// structural.
export function ladderHasStructuralRung(ladder: LadderState): boolean {
  return ladder.stack.some((rung) => rung.kind !== 'inline');
}

function nextKind({ stack, entrySelection }: LadderState): Rung['kind'] {
  if (stack.length === 0) return 'inline';
  if (stack.length === 1 && !entrySelection) return 'subtree';
  return 'sibling';
}

export function pushStep(state: LadderState, direction: Direction | null): LadderState {
  const kind = nextKind(state);
  const rung: Rung = kind === 'sibling' ? { kind, direction } : { kind };
  return {
    ...state,
    stack: [...state.stack, rung],
    direction,
  };
}

export function popStep(state: LadderState): LadderState {
  const stack = state.stack.slice(0, -1);
  // Contraction doesn't change which way the ladder was grown; only an empty
  // stack (back to a caret) clears the growth direction.
  return {
    ...state,
    stack,
    direction: stack.length === 0 ? null : state.direction,
  };
}

function $createInlinePlan(item: ListItemNode): ProgressivePlan | null {
  if (isEmptyNoteBody(item)) {
    return null;
  }
  return $hasInlineBoundary(item) ? { type: 'inline', itemKey: item.getKey() } : null;
}

export function $createSubtreePlan(item: ListItemNode): ProgressivePlan {
  return {
    type: 'range',
    startKey: item.getKey(),
    endKey: item.getKey(),
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
 */
export function $replayLadder(
  anchorItem: ListItemNode,
  stack: Rung[],
  boundaryKey: string | null = null
): ProgressivePlan | null {
  const boundaryRoot = boundaryKey ? $getListItemByKey(boundaryKey) : null;
  const withinBoundary = (item: ListItemNode): boolean =>
    !boundaryRoot || isContentDescendantOf(item, boundaryRoot) || item.getKey() === boundaryRoot.getKey();

  // contextItem tracks the "active level" item for hoist/sibling navigation.
  // It starts at the anchor and shifts up when a sibling step hoists.
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

    // Sibling rung. A sweep step advances one position in the sweep direction at
    // the current level (contextItem). If a sibling exists there, extend the
    // range to it and its subtree; otherwise hoist to the parent level and take
    // the parent's whole subtree (the hoist itself is the step). A step that can
    // neither advance nor hoist (past the document/view root) is unresolvable.
    //
    // In whole-group mode the range extends to every sibling at this level
    // instead of advancing by one. Hoist behaviour is unchanged.
    // Continue from the selected edge when an arrow follows a whole-group rung.
    if (rung.direction === 'up' && startHead) contextItem = startHead;
    if (rung.direction === 'down' && endHead) contextItem = endHead;
    const sibling =
      rung.direction === 'down' ? getNextContentSibling(contextItem) : getPreviousContentSibling(contextItem);

    if (rung.direction === null) {
      // Extend the range to ALL siblings at the current level
      // (first to last), advancing contextItem to the last one. This selects
      // the entire sibling group in one press, regardless of sweep direction.
      //
      // Hoist (fall through) when either:
      //   - There are no siblings at this level (only one item in the list), or
      //   - The range already covers the full sibling group (detected by
      //     startHead/endHead already pinned to first/last), meaning a previous
      //     whole-group rung consumed this level. The next rung escalates.
      const allSiblings = getContentSiblingsForItem(contextItem).filter(withinBoundary);
      const firstSib = allSiblings[0];
      const lastSib = allSiblings.at(-1);
      const alreadyFullSiblingGroup =
        firstSib &&
        lastSib &&
        startHead?.getKey() === firstSib.getKey() &&
        endHead?.getKey() === lastSib.getKey();
      if (firstSib && lastSib && allSiblings.length > 1 && !alreadyFullSiblingGroup) {
        startHead = firstSib;
        endHead = lastSib;
        contextItem = lastSib;
        continue;
      }
      // A single item or an already-covered group falls through to hoist.
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

  return {
    type: 'range',
    startKey: startHead.getKey(),
    endKey: endHead.getKey(),
  };
}
