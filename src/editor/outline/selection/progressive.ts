import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import { $getNodeByKey, $getRoot, $getSelection, $isRangeSelection } from 'lexical';

import { reportInvariant } from '@/editor/invariant';
import { getContentListItem, getPreviousContentSibling } from '@/editor/outline/list-structure';

import type { BoundaryMode } from './apply';
import { selectInlineContent, selectNoteBody, setSelectionBetweenItems } from './apply';
import { resolveContentBoundaryPoint } from './caret';
import { getContiguousSelectionHeads } from './heads';
import type { ProgressiveSelectionState } from './resolve';
import { resolveSelectionPointItem } from './resolve';
import {
  getContentSiblingsForItem,
  getFirstDescendantListItem,
  getLastDescendantListItem,
  getNextContentSibling,
  getParentContentItem,
  getSubtreeTail,
  sortHeadsByDocumentOrder,
} from './tree';

export interface ProgressiveSelectionRef {
  current: ProgressiveSelectionState;
}

export const INITIAL_PROGRESSIVE_STATE: ProgressiveSelectionState = {
  anchorKey: null,
  stage: 0,
  locked: false,
};

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

export interface ProgressivePlanResult {
  anchorKey: string;
  stage: number;
  plan: ProgressivePlan;
  repeatStage?: boolean;
}

export function $computeProgressivePlan(
  progressionRef: ProgressiveSelectionRef,
  initialProgression: ProgressiveSelectionState
): ProgressivePlanResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = initialProgression;
    return null;
  }

  let resolvedAnchorItem: ListItemNode | null = null;
  if (selection.isCollapsed()) {
    resolvedAnchorItem = resolveSelectionPointItem(selection, selection.anchor);
    const resolvedAnchorKey = resolvedAnchorItem ? getContentListItem(resolvedAnchorItem).getKey() : null;
    const shouldReset =
      !progressionRef.current.anchorKey ||
      progressionRef.current.stage < 2 ||
      !resolvedAnchorKey ||
      progressionRef.current.anchorKey !== resolvedAnchorKey;
    if (shouldReset) {
      progressionRef.current = initialProgression;
    }
  }

  let anchorContent: ListItemNode | null = null;
  if (progressionRef.current.anchorKey) {
    const storedAnchor = $getNodeByKey<ListItemNode>(progressionRef.current.anchorKey);
    if (storedAnchor) {
      anchorContent = getContentListItem(storedAnchor);
    }
  }

  if (!anchorContent) {
    const anchorItem = resolvedAnchorItem ?? resolveSelectionPointItem(selection, selection.anchor);
    if (!anchorItem) {
      reportInvariant({
        message: 'Directional plan could not find anchor list item',
      });
      progressionRef.current = initialProgression;
      return null;
    }
    anchorContent = getContentListItem(anchorItem);
  }

  const anchorKey = anchorContent.getKey();
  const isContinuing = progressionRef.current.anchorKey === anchorKey;
  const nextStage = isContinuing ? progressionRef.current.stage + 1 : 1;

  const planEntry = $buildPlanForStage(anchorContent, nextStage);
  if (!planEntry) {
    progressionRef.current = initialProgression;
    return null;
  }

  return {
    anchorKey,
    stage: planEntry.stage,
    plan: planEntry.plan,
  };
}

export function $computeDirectionalPlan(
  progressionRef: ProgressiveSelectionRef,
  direction: 'up' | 'down',
  initialProgression: ProgressiveSelectionState
): ProgressivePlanResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = initialProgression;
    return null;
  }

  let resolvedAnchorItem: ListItemNode | null = null;
  if (selection.isCollapsed()) {
    resolvedAnchorItem = resolveSelectionPointItem(selection, selection.anchor);
    const resolvedAnchorKey = resolvedAnchorItem ? getContentListItem(resolvedAnchorItem).getKey() : null;
    const shouldReset =
      !progressionRef.current.anchorKey ||
      progressionRef.current.stage < 2 ||
      !resolvedAnchorKey ||
      progressionRef.current.anchorKey !== resolvedAnchorKey;
    if (shouldReset) {
      progressionRef.current = initialProgression;
    }
  }

  let anchorContent: ListItemNode | null = null;
  if (progressionRef.current.anchorKey) {
    const storedAnchor = $getNodeByKey<ListItemNode>(progressionRef.current.anchorKey);
    if (storedAnchor) {
      anchorContent = getContentListItem(storedAnchor);
    }
  }

  if (!anchorContent) {
    const anchorItem = resolvedAnchorItem ?? resolveSelectionPointItem(selection, selection.anchor);
    if (!anchorItem) {
      progressionRef.current = initialProgression;
      return null;
    }
    anchorContent = getContentListItem(anchorItem);
  }

  const anchorKey = anchorContent.getKey();
  const isContinuing = progressionRef.current.locked && progressionRef.current.anchorKey === anchorKey;
  let stage = isContinuing ? progressionRef.current.stage : 0;
  const heads = getContiguousSelectionHeads(selection);

  const MAX_STAGE = 64;
  while (stage < MAX_STAGE + 1) {
    stage += 1;
    const planResult = $buildDirectionalStagePlan(anchorContent, heads, stage, direction);
    if (planResult) {
      return planResult;
    }

    if (stage >= MAX_STAGE) {
      break;
    }
  }

  return null;
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
  stage: number
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
  if (!targetContent) {
    const docPlan = $createDocumentPlan();
    return docPlan ? { plan: docPlan, stage } : null;
  }

  if (includeSiblings) {
    const parentList = targetContent.getParent();
    if ($isListNode(parentList)) {
      const parentParent = parentList.getParent();
      if (parentParent && parentParent === $getRoot()) {
        const docPlan = $createDocumentPlan();
        if (docPlan) {
          return { plan: docPlan, stage };
        }
      }
    }

    const siblingPlan = $createSiblingRangePlan(targetContent);
    if (siblingPlan) {
      return { plan: siblingPlan, stage };
    }

    return $buildPlanForStage(anchorContent, stage + 1);
  }

  const subtreePlan = $createSubtreePlan(targetContent);
  if (subtreePlan) {
    return { plan: subtreePlan, stage };
  }

  return $buildPlanForStage(anchorContent, stage + 1);
}

function $buildDirectionalStagePlan(
  anchorContent: ListItemNode,
  heads: ListItemNode[],
  stage: number,
  direction: 'up' | 'down'
): ProgressivePlanResult | null {
  const anchorKey = anchorContent.getKey();
  const resolvedHeads = heads.length > 0 ? heads : [anchorContent];

  if (stage === 1) {
    const inlinePlan = $createInlinePlan(anchorContent);
    return inlinePlan ? { anchorKey, stage: 1, plan: inlinePlan } : null;
  }

  if (stage === 2) {
    const subtreePlan = $createSubtreePlan(anchorContent);
    return subtreePlan ? { anchorKey, stage: 2, plan: subtreePlan } : null;
  }

  const relative = stage - 3;
  if (relative < 0) {
    return null;
  }

  const levelsUp = Math.floor((relative + 1) / 2);
  const isSiblingStage = relative % 2 === 0;
  const target = levelsUp === 0 ? anchorContent : ascendContentItem(anchorContent, levelsUp);

  if (!target) {
    const docPlan = $createDocumentPlan();
    if (!docPlan) {
      return null;
    }
    return { anchorKey, stage, plan: docPlan };
  }

  const allHeads = resolvedHeads.length > 0 ? resolvedHeads : [anchorContent];
  const sortedHeads = sortHeadsByDocumentOrder(allHeads);

  if (isSiblingStage) {
    return $buildDirectionalSiblingPlan(target, resolvedHeads, sortedHeads, direction, anchorKey, stage);
  }

  return $buildDirectionalAncestorPlan(target, resolvedHeads, anchorKey, stage);
}

function $buildDirectionalSiblingPlan(
  target: ListItemNode,
  resolvedHeads: ListItemNode[],
  sortedHeads: ListItemNode[],
  direction: 'up' | 'down',
  anchorKey: string,
  stage: number
): ProgressivePlanResult | null {
  const siblingList = target.getParent();
  if (!$isListNode(siblingList)) {
    return null;
  }

  const headsAtLevel = getHeadsSharingParent(resolvedHeads, siblingList);
  if (headsAtLevel.length === 0) {
    headsAtLevel.push(target);
  }
  const sortedLevelHeads = sortHeadsByDocumentOrder(headsAtLevel);

  if (direction === 'down') {
    const forwardBoundary = sortedLevelHeads.at(-1)!;
    let sibling = getNextContentSibling(forwardBoundary);
    let extendDirection: 'forward' | 'backward' = 'forward';

    if (!sibling) {
      const backwardBoundary = sortedLevelHeads[0]!;
      sibling = getPreviousContentSibling(backwardBoundary);
      extendDirection = 'backward';
    }

    if (!sibling) {
      return null;
    }

    const plan: ProgressivePlan =
      extendDirection === 'forward'
        ? {
            type: 'range',
            startKey: sortedHeads[0]!.getKey(),
            endKey: getSubtreeTail(sibling).getKey(),
            startMode: 'content',
            endMode: 'subtree',
          }
        : {
            type: 'range',
            startKey: sibling.getKey(),
            endKey: getSubtreeTail(sortedHeads.at(-1)!).getKey(),
            startMode: 'content',
            endMode: 'subtree',
          };

    const repeatStage =
      extendDirection === 'forward'
        ? Boolean(getNextContentSibling(sibling))
        : Boolean(getPreviousContentSibling(sibling));

    return {
      anchorKey,
      stage,
      plan,
      repeatStage,
    };
  }

  const backwardBoundary = sortedLevelHeads[0]!;
  let sibling = getPreviousContentSibling(backwardBoundary);
  let extendDirection: 'forward' | 'backward' = 'backward';

  if (!sibling) {
    const forwardBoundary = sortedLevelHeads.at(-1)!;
    sibling = getNextContentSibling(forwardBoundary);
    extendDirection = 'forward';
  }

  if (!sibling) {
    return null;
  }

  const plan: ProgressivePlan =
    extendDirection === 'backward'
      ? {
          type: 'range',
          startKey: sibling.getKey(),
          endKey: getSubtreeTail(sortedHeads.at(-1)!).getKey(),
          startMode: 'content',
          endMode: 'subtree',
        }
      : {
          type: 'range',
          startKey: sortedHeads[0]!.getKey(),
          endKey: getSubtreeTail(sibling).getKey(),
          startMode: 'content',
          endMode: 'subtree',
        };

  const repeatStage =
    extendDirection === 'backward'
      ? Boolean(getPreviousContentSibling(sibling))
      : Boolean(getNextContentSibling(sibling));

  return {
    anchorKey,
    stage,
    plan,
    repeatStage,
  };
}

function $buildDirectionalAncestorPlan(
  target: ListItemNode,
  resolvedHeads: ListItemNode[],
  anchorKey: string,
  stage: number
): ProgressivePlanResult | null {
  const alreadySelected = resolvedHeads.some((head) => head.getKey() === target.getKey());
  if (alreadySelected) {
    return null;
  }

  const plan = $createSubtreePlan(target);
  if (!plan) {
    return null;
  }

  return {
    anchorKey,
    stage,
    plan,
  };
}

function $createInlinePlan(item: ListItemNode): ProgressivePlan | null {
  if (isEmptyNoteBody(item)) {
    return null;
  }
  return $hasInlineBoundary(item) ? { type: 'inline', itemKey: item.getKey() } : null;
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

function $createSubtreePlan(item: ListItemNode): ProgressivePlan | null {
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
  const root = $getRoot();
  const list = root.getFirstChild();
  if (!$isListNode(list)) {
    return null;
  }

  const firstItem = getFirstDescendantListItem(list);
  const lastItem = getLastDescendantListItem(list);
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

function $hasInlineBoundary(item: ListItemNode): boolean {
  return Boolean(resolveContentBoundaryPoint(item, 'start') && resolveContentBoundaryPoint(item, 'end'));
}

function isEmptyNoteBody(item: ListItemNode): boolean {
  const contentItem = getContentListItem(item);
  const pieces: string[] = [];

  for (const child of contentItem.getChildren()) {
    if ($isListNode(child)) {
      continue;
    }
    const getTextContent = (child as { getTextContent?: () => string }).getTextContent;
    if (typeof getTextContent === 'function') {
      pieces.push(getTextContent.call(child));
    }
  }

  return pieces.join('').trim().length === 0;
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

function getHeadsSharingParent(heads: ListItemNode[], parentList: ListNode): ListItemNode[] {
  return heads.filter((head) => head.getParent() === parentList);
}
