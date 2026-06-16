import type { ListItemNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';
import { $getNodeByKey, $getRoot, $getSelection, $isRangeSelection } from 'lexical';

import { reportInvariant } from '#client/editor/invariant';
import { $requireRootContentList } from '#client/editor/outline/schema';

import { selectInlineContent, selectNoteBody, setSelectionBetweenItems } from './apply';
import { isEmptyNoteBody } from './note-body';
import type { ProgressiveSelectionState } from './resolve';
import { resolveSelectionPointItem } from './resolve';
import {
  $createInlinePlan,
  $createSubtreePlan,
  $replayLadder,
  emptyLadder,
  popStep,
  pushStep,
} from './rungs';
import type { LadderState, ProgressivePlan, Rung } from './rungs';
import {
  getContentSiblingsForItem,
  getFirstDescendantListItem,
  getLastDescendantListItem,
  getParentContentItem,
  getSubtreeTail,
  isContentDescendantOf,
} from './tree';

interface ProgressiveSelectionRef {
  current: ProgressiveSelectionState;
}

// Empty ladder constant. `anchorKey: ''` is the canonical "no anchor yet"
// sentinel: it never equals a real Lexical node key, so the snapshot's
// anchor-match checks and the directional path's "continuing" check both
// treat it as a fresh start.
export const INITIAL_PROGRESSIVE_STATE: ProgressiveSelectionState = emptyLadder('');

export interface ProgressivePlanResult {
  anchorKey: string;
  stage: number;
  plan: ProgressivePlan;
  repeatStage?: boolean;
  isShrink?: boolean;
}

// Signals that the directional path popped past the bottom of the ladder and
// the selection should collapse to a caret at the anchor.
export interface DirectionalCollapseResult {
  collapse: true;
  anchorKey: string;
}

// Signals that the press had no effect (same-direction press at a caret, or a
// growth push blocked by the document/zoom boundary). The ladder is unchanged.
export interface DirectionalNoopResult {
  noop: true;
}

/**
 * Synthesize a ladder whose stack length encodes a Cmd/Ctrl+A stage so the
 * shared ref can stay a single LadderState while Task 4 still drives Cmd+A by
 * stage number. Rung kinds are chosen only so structural-intent derivation
 * (any non-inline rung) matches the stage: 0 -> inline, 1 -> subtree,
 * >=2 -> sibling. The stack is not replayed for Cmd+A. TODO(Task 4): route
 * Cmd+A through the ladder so this synthesis can go away.
 */
function ladderForStage(anchorKey: string, stage: number): LadderState {
  const stack: Rung[] = [];
  for (let depth = 0; depth < stage; depth += 1) {
    if (depth === 0) {
      stack.push({ kind: 'inline' });
    } else if (depth === 1) {
      stack.push({ kind: 'subtree' });
    } else {
      stack.push({ kind: 'sibling', direction: 'down' });
    }
  }
  return { anchorKey, stack, direction: null };
}

function $resolveBoundaryRoot(boundaryKey: string | null | undefined): ListItemNode | null {
  if (!boundaryKey) {
    return null;
  }
  const node = $getNodeByKey<ListItemNode>(boundaryKey);
  if (!node) {
    return null;
  }
  return node;
}

function $resolveDocumentPlan(boundaryRoot: ListItemNode | null): ProgressivePlan | null {
  if (boundaryRoot) {
    return $createSubtreePlan(boundaryRoot);
  }
  return $createDocumentPlan();
}

function $resolveProgressionAnchorContent(
  selection: RangeSelection,
  progressionRef: ProgressiveSelectionRef,
  initialProgression: ProgressiveSelectionState,
  onMissingAnchor?: () => void
): ListItemNode | null {
  let resolvedAnchorItem: ListItemNode | null = null;
  if (selection.isCollapsed()) {
    resolvedAnchorItem = resolveSelectionPointItem(selection, selection.anchor);
    const resolvedAnchorKey = resolvedAnchorItem ? resolvedAnchorItem.getKey() : null;
    const ladder = progressionRef.current;
    const isStructural = ladder.stack.some((rung) => rung.kind !== 'inline');
    const shouldReset =
      !ladder.anchorKey ||
      !isStructural ||
      !resolvedAnchorKey ||
      ladder.anchorKey !== resolvedAnchorKey;
    if (shouldReset) {
      progressionRef.current = initialProgression;
    }
  }

  let anchorContent: ListItemNode | null = null;
  if (progressionRef.current.anchorKey) {
    const storedAnchor = $getNodeByKey<ListItemNode>(progressionRef.current.anchorKey);
    if (storedAnchor) {
      anchorContent = storedAnchor;
    }
  }

  if (!anchorContent) {
    const anchorItem = resolvedAnchorItem ?? resolveSelectionPointItem(selection, selection.anchor);
    if (!anchorItem) {
      onMissingAnchor?.();
      progressionRef.current = initialProgression;
      return null;
    }
    anchorContent = anchorItem;
  }

  return anchorContent;
}

export function $computeProgressivePlan(
  progressionRef: ProgressiveSelectionRef,
  initialProgression: ProgressiveSelectionState,
  boundaryKey: string | null = null
): ProgressivePlanResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = initialProgression;
    return null;
  }

  const anchorContent = $resolveProgressionAnchorContent(selection, progressionRef, initialProgression, () => {
    reportInvariant({
      message: 'Directional plan could not find anchor list item',
    });
  });
  if (!anchorContent) {
    return null;
  }

  const anchorKey = anchorContent.getKey();
  const isContinuing = progressionRef.current.anchorKey === anchorKey;
  const nextStage = isContinuing ? progressionRef.current.stack.length + 1 : 1;

  const boundaryRoot = $resolveBoundaryRoot(boundaryKey);
  const planEntry = $buildPlanForStage(anchorContent, nextStage, boundaryRoot);
  if (!planEntry) {
    progressionRef.current = initialProgression;
    return null;
  }

  // Encode the Cmd/Ctrl+A stage into the ladder so the shared ref stays a
  // single LadderState. TODO(Task 4): route Cmd+A through the ladder directly.
  progressionRef.current = ladderForStage(anchorKey, planEntry.stage);

  return {
    anchorKey,
    stage: planEntry.stage,
    plan: planEntry.plan,
  };
}

/**
 * Route a Shift+Arrow press through the rung ladder (push/pop + replay).
 *
 * The ladder is the single source of truth. Growth (sweep direction, or any
 * direction before a sweep is set) pushes the next rung; contraction (opposite
 * of the recorded sweep direction) pops the top rung. Contracting past the
 * bottom of the stack collapses to a caret. A same-direction press once the
 * ladder is back at a caret is a no-op (stop-at-anchor, never flip).
 *
 * Returns a plan to apply, a collapse signal, a no-op signal, or null when the
 * selection/anchor cannot be resolved (caller resets the ladder).
 */
export function $computeDirectionalPlan(
  progressionRef: ProgressiveSelectionRef,
  direction: 'up' | 'down',
  initialProgression: ProgressiveSelectionState,
  boundaryKey: string | null = null
): ProgressivePlanResult | DirectionalCollapseResult | DirectionalNoopResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = initialProgression;
    return null;
  }

  const stored = progressionRef.current;
  const storedAnchor = stored.anchorKey ? $getNodeByKey<ListItemNode>(stored.anchorKey) : null;
  const resolvedAnchor = resolveSelectionPointItem(selection, selection.anchor);

  // Caret no-op memory: after a ladder contracts to a caret, the empty stack
  // keeps the recorded sweep direction. A further press in the *contraction*
  // direction (opposite of the sweep) is a no-op (stop-at-anchor, never flip);
  // a press in the sweep direction re-grows the ladder from the anchor.
  if (
    selection.isCollapsed() &&
    stored.stack.length === 0 &&
    stored.direction !== null &&
    storedAnchor &&
    resolvedAnchor &&
    storedAnchor.getKey() === resolvedAnchor.getKey()
  ) {
    if (direction !== stored.direction) {
      return { noop: true };
    }
    // Sweep direction: fall through and re-grow a fresh ladder.
  }

  const anchorContent = $resolveProgressionAnchorContent(selection, progressionRef, initialProgression);
  if (!anchorContent) {
    return null;
  }

  const anchorKey = anchorContent.getKey();
  const ladder = progressionRef.current;
  const isContinuing = ladder.anchorKey === anchorKey && ladder.stack.length > 0;
  const sweep = isContinuing ? ladder.direction : null;
  const boundaryRoot = $resolveBoundaryRoot(boundaryKey);
  const boundaryReplayKey = boundaryRoot ? boundaryRoot.getKey() : null;

  // Contraction: opposite of the recorded sweep direction.
  if (isContinuing && sweep !== null && direction !== sweep) {
    let next = popStep(ladder);
    // Collapsing to a caret keeps the empty-stack ladder but RETAINS the sweep
    // direction so a further press in the contraction direction is a no-op
    // (stop-at-anchor) while the opposite direction can start a fresh ladder.
    if (next.stack.length === 0) {
      progressionRef.current = { anchorKey, stack: [], direction: sweep };
      return { collapse: true, anchorKey };
    }
    // Preserve the sweep-direction memory while contracting so further presses
    // keep popping (popStep itself drops it once no sibling rung remains).
    next = { ...next, direction: sweep };
    const plan = $replayLadder(anchorContent, next.stack, boundaryReplayKey);
    if (!plan) {
      progressionRef.current = { anchorKey, stack: [], direction: sweep };
      return { collapse: true, anchorKey };
    }
    progressionRef.current = next;
    return { anchorKey, stage: next.stack.length, plan };
  }

  // Growth: push the next rung (fresh ladder when not continuing).
  const base = isContinuing ? ladder : emptyLadder(anchorKey);
  let next = pushStep(base, direction);
  let plan = $replayLadder(anchorContent, next.stack, boundaryReplayKey);

  // Skip an empty inline rung: if the freshly pushed rung produced no plan (an
  // empty note body has no inline boundary), push one more to reach subtree.
  if (!plan && next.stack.length === 1) {
    next = pushStep(next, direction);
    plan = $replayLadder(anchorContent, next.stack, boundaryReplayKey);
  }

  if (!plan) {
    // Boundary push (past document/zoom root) — no-op, keep the current ladder.
    return { noop: true };
  }

  progressionRef.current = next;
  return { anchorKey, stage: next.stack.length, plan };
}

export function $applyProgressivePlan(result: ProgressivePlanResult): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  if (result.plan.type === 'inline') {
    const item = $getNodeByKey<ListItemNode>(result.plan.itemKey);
    if (!item) {
      return false;
    }
    if (!selectInlineContent(selection, item)) {
      return selectNoteBody(selection, item);
    }
    return true;
  }

  const startItem = $getNodeByKey<ListItemNode>(result.plan.startKey);
  const endItem = $getNodeByKey<ListItemNode>(result.plan.endKey);
  if (!startItem || !endItem) {
    return false;
  }

  return setSelectionBetweenItems(selection, startItem, endItem, result.plan.startMode, result.plan.endMode);
}

function $buildPlanForStage(
  anchorContent: ListItemNode,
  stage: number,
  boundaryRoot: ListItemNode | null
): { plan: ProgressivePlan; stage: number } | null {
  if (stage <= 1) {
    const inlinePlan = $createInlinePlan(anchorContent);
    if (inlinePlan) {
      return { plan: inlinePlan, stage: 1 };
    }
    if (isEmptyNoteBody(anchorContent)) {
      const subtreePlan = $createSubtreePlan(anchorContent);
      return subtreePlan ? { plan: subtreePlan, stage: 2 } : null;
    }
    const notePlan = $createNoteBodyPlan(anchorContent);
    return notePlan ? { plan: notePlan, stage: 2 } : null;
  }

  if (stage === 2) {
    const subtreePlan = $createSubtreePlan(anchorContent);
    return subtreePlan ? { plan: subtreePlan, stage: 2 } : null;
  }

  const relative = stage - 3;
  const levelsUp = Math.floor((relative + 1) / 2);
  const includeSiblings = relative % 2 === 0;

  const targetContent = ascendContentItem(anchorContent, levelsUp);
  if (!targetContent || (boundaryRoot && !isContentDescendantOf(targetContent, boundaryRoot))) {
    const docPlan = $resolveDocumentPlan(boundaryRoot);
    return docPlan ? { plan: docPlan, stage } : null;
  }

  if (includeSiblings) {
    if (boundaryRoot && targetContent.getKey() === boundaryRoot.getKey()) {
      const docPlan = $resolveDocumentPlan(boundaryRoot);
      return docPlan ? { plan: docPlan, stage } : null;
    }
    const parentList = targetContent.getParent();
    if ($isListNode(parentList)) {
      const parentParent = parentList.getParent();
      if (parentParent && parentParent === $getRoot()) {
        const docPlan = $resolveDocumentPlan(boundaryRoot);
        if (docPlan) {
          return { plan: docPlan, stage };
        }
      }
    }

    const siblingPlan = $createSiblingRangePlan(targetContent);
    if (siblingPlan) {
      return { plan: siblingPlan, stage };
    }

    return $buildPlanForStage(anchorContent, stage + 1, boundaryRoot);
  }

  const subtreePlan = $createSubtreePlan(targetContent);
  if (subtreePlan) {
    return { plan: subtreePlan, stage };
  }

  return $buildPlanForStage(anchorContent, stage + 1, boundaryRoot);
}


function $createNoteBodyPlan(item: ListItemNode): ProgressivePlan | null {
  return {
    type: 'range',
    startKey: item.getKey(),
    endKey: item.getKey(),
    startMode: 'content',
    endMode: 'content',
  };
}

function $createSiblingRangePlan(item: ListItemNode): ProgressivePlan | null {
  const siblings = getContentSiblingsForItem(item);
  if (siblings.length <= 1) {
    return null;
  }

  const lastSibling = siblings.at(-1)!;
  const tail = getSubtreeTail(lastSibling);
  return {
    type: 'range',
    startKey: siblings[0]!.getKey(),
    endKey: tail.getKey(),
    startMode: 'content',
    endMode: 'subtree',
  };
}

function $createDocumentPlan(): ProgressivePlan | null {
  const rootList = $requireRootContentList();
  const firstItem = getFirstDescendantListItem(rootList);
  const lastItem = getLastDescendantListItem(rootList);
  if (!firstItem || !lastItem) {
    return null;
  }

  const tail = getSubtreeTail(lastItem);
  return {
    type: 'range',
    startKey: firstItem.getKey(),
    endKey: tail.getKey(),
    startMode: 'content',
    endMode: 'subtree',
  };
}

function ascendContentItem(item: ListItemNode, levels: number): ListItemNode | null {
  let current: ListItemNode | null = item;

  for (let i = 0; i < levels; i += 1) {
    current = getParentContentItem(current);
    if (!current) {
      return null;
    }
  }

  return current;
}
