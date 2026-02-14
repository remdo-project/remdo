import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';
import { $getNodeByKey, $getRoot, $getSelection, $isRangeSelection } from 'lexical';

import { reportInvariant } from '@/editor/invariant';
import { getPreviousContentSibling } from '@/editor/outline/list-structure';

import type { BoundaryMode } from './apply';
import { selectInlineContent, selectNoteBody, setSelectionBetweenItems } from './apply';
import { resolveContentBoundaryPoint } from './caret';
import { getContiguousSelectionHeads } from './heads';
import { isEmptyNoteBody } from './note-body';
import type { ProgressiveSelectionState } from './resolve';
import { resolveSelectionPointItem } from './resolve';
import {
  getContentSiblingsForItem,
  getFirstDescendantListItem,
  getLastDescendantListItem,
  getNextContentSibling,
  getParentContentItem,
  getSubtreeTail,
  isContentDescendantOf,
  sortHeadsByDocumentOrder,
} from './tree';

interface ProgressiveSelectionRef {
  current: ProgressiveSelectionState;
}

export const INITIAL_PROGRESSIVE_STATE: ProgressiveSelectionState = {
  anchorKey: null,
  stage: 0,
  locked: false,
  lastDirection: null,
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
  isShrink?: boolean;
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
  const nextStage = isContinuing ? progressionRef.current.stage + 1 : 1;

  const boundaryRoot = $resolveBoundaryRoot(boundaryKey);
  const planEntry = $buildPlanForStage(anchorContent, nextStage, boundaryRoot);
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
  initialProgression: ProgressiveSelectionState,
  boundaryKey: string | null = null
): ProgressivePlanResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = initialProgression;
    return null;
  }

  const anchorContent = $resolveProgressionAnchorContent(selection, progressionRef, initialProgression);
  if (!anchorContent) {
    return null;
  }

  const anchorKey = anchorContent.getKey();
  const lastDirection = progressionRef.current.lastDirection;
  if (lastDirection && lastDirection !== direction && progressionRef.current.locked) {
    const shrinkPlan = $buildDirectionalShrinkPlan(anchorContent, selection, lastDirection);
    if (shrinkPlan) {
      return shrinkPlan;
    }
  }

  const isContinuing = progressionRef.current.locked && progressionRef.current.anchorKey === anchorKey;
  let stage = isContinuing ? progressionRef.current.stage : 0;
  const heads = getContiguousSelectionHeads(selection);
  const boundaryRoot = $resolveBoundaryRoot(boundaryKey);

  const MAX_STAGE = 64;
  while (stage < MAX_STAGE + 1) {
    stage += 1;
    const planResult = $buildDirectionalStagePlan(anchorContent, heads, stage, direction, boundaryRoot);
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

function $buildDirectionalStagePlan(
  anchorContent: ListItemNode,
  heads: ListItemNode[],
  stage: number,
  direction: 'up' | 'down',
  boundaryRoot: ListItemNode | null
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

  if (!target || (boundaryRoot && !isContentDescendantOf(target, boundaryRoot))) {
    const docPlan = $resolveDocumentPlan(boundaryRoot);
    if (!docPlan) {
      return null;
    }
    return { anchorKey, stage, plan: docPlan };
  }

  const allHeads = resolvedHeads.length > 0 ? resolvedHeads : [anchorContent];
  const sortedHeads = sortHeadsByDocumentOrder(allHeads);

  if (isSiblingStage) {
    if (boundaryRoot && target.getKey() === boundaryRoot.getKey()) {
      const docPlan = $resolveDocumentPlan(boundaryRoot);
      return docPlan ? { anchorKey, stage, plan: docPlan } : null;
    }
    return $buildDirectionalSiblingPlan(target, resolvedHeads, sortedHeads, direction, anchorKey, stage);
  }

  return $buildDirectionalAncestorPlan(target, resolvedHeads, anchorKey, stage);
}

function $buildDirectionalShrinkPlan(
  anchorContent: ListItemNode,
  selection: RangeSelection,
  lastDirection: 'up' | 'down'
): ProgressivePlanResult | null {
  const anchorKey = anchorContent.getKey();
  const heads = getContiguousSelectionHeads(selection);
  if (heads.length === 0) {
    return null;
  }

  const sortedHeads = sortHeadsByDocumentOrder(heads);
  const anchorHead = sortedHeads[0]!.getKey() === anchorKey && sortedHeads.length === 1;
  if (anchorHead) {
    return null;
  }

  if (sortedHeads.length === 1) {
    const head = sortedHeads[0]!;
    if (!isAncestorOfAnchor(head, anchorContent)) {
      return null;
    }

    const anchorChild = findChildOnPath(head, anchorContent);
    if (!anchorChild) {
      return null;
    }

    const siblings = getContentSiblingsForItem(anchorChild);
    const siblingPlan = $createSiblingRangePlan(anchorChild);
    if (siblingPlan) {
      const stageInfo = inferSiblingStage(anchorContent, siblings);
      if (!stageInfo) {
        return null;
      }
      return {
        anchorKey,
        stage: stageInfo.stage,
        plan: siblingPlan,
        repeatStage: stageInfo.repeatStage,
        isShrink: true,
      };
    }

    const subtreePlan = $createSubtreePlan(anchorChild);
    if (!subtreePlan) {
      return null;
    }

    return {
      anchorKey,
      stage: 2,
      plan: subtreePlan,
      isShrink: true,
    };
  }

  const newHeads =
    lastDirection === 'down' ? sortedHeads.slice(0, -1) : sortedHeads.slice(1);
  if (newHeads.length === 0) {
    return null;
  }

  const plan = buildRangePlanFromHeads(newHeads);
  const stageInfo = inferSiblingStage(anchorContent, newHeads);
  if (!stageInfo) {
    return null;
  }

  return {
    anchorKey,
    stage: stageInfo.stage,
    plan,
    repeatStage: stageInfo.repeatStage,
    isShrink: true,
  };
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
    const sibling = getNextContentSibling(forwardBoundary);
    if (!sibling) {
      return null;
    }

    const plan: ProgressivePlan = {
      type: 'range',
      startKey: sortedHeads[0]!.getKey(),
      endKey: getSubtreeTail(sibling).getKey(),
      startMode: 'content',
      endMode: 'subtree',
    };

    const repeatStage = Boolean(getNextContentSibling(sibling));

    return {
      anchorKey,
      stage,
      plan,
      repeatStage,
    };
  }

  const backwardBoundary = sortedLevelHeads[0]!;
  const sibling = getPreviousContentSibling(backwardBoundary);
  if (!sibling) {
    return null;
  }

  const plan: ProgressivePlan = {
    type: 'range',
    startKey: sibling.getKey(),
    endKey: getSubtreeTail(sortedHeads.at(-1)!).getKey(),
    startMode: 'content',
    endMode: 'subtree',
  };

  const repeatStage = Boolean(getPreviousContentSibling(sibling));

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

function $getDocumentBoundaryItems(): { start: ListItemNode; end: ListItemNode } | null {
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

  return { start: firstItem, end: getSubtreeTail(lastItem) };
}

function $resolveBoundaryItems(boundaryRoot: ListItemNode | null): { start: ListItemNode; end: ListItemNode } | null {
  if (boundaryRoot) {
    return { start: boundaryRoot, end: getSubtreeTail(boundaryRoot) };
  }
  return $getDocumentBoundaryItems();
}

export function $isDirectionalBoundary(
  selection: RangeSelection,
  direction: 'up' | 'down',
  boundaryKey: string | null = null
): boolean {
  const heads = getContiguousSelectionHeads(selection);
  if (heads.length === 0) {
    return false;
  }

  const boundaryRoot = $resolveBoundaryRoot(boundaryKey);
  const boundary = $resolveBoundaryItems(boundaryRoot);
  if (!boundary) {
    return false;
  }

  const sortedHeads = sortHeadsByDocumentOrder(heads);
  if (direction === 'down') {
    const visualEnd = getSubtreeTail(sortedHeads.at(-1)!);
    return visualEnd.getKey() === boundary.end.getKey();
  }

  const visualStart = sortedHeads[0]!;
  return visualStart.getKey() === boundary.start.getKey();
}

function buildRangePlanFromHeads(heads: ListItemNode[]): ProgressivePlan {
  const sorted = sortHeadsByDocumentOrder(heads);
  const startKey = sorted[0]!.getKey();
  const endKey = getSubtreeTail(sorted.at(-1)!).getKey();
  return {
    type: 'range',
    startKey,
    endKey,
    startMode: 'content',
    endMode: 'subtree',
  };
}

function inferSiblingStage(
  anchorContent: ListItemNode,
  heads: ListItemNode[]
): { stage: number; repeatStage: boolean } | null {
  if (heads.length === 0) {
    return null;
  }

  const parentList = heads[0]!.getParent();
  if (!$isListNode(parentList)) {
    return null;
  }

  const levelsUp = getLevelsUpToParent(anchorContent, parentList);
  if (levelsUp === null) {
    return null;
  }

  const isAnchorOnly = heads.length === 1 && heads[0]!.getKey() === anchorContent.getKey();
  const stage = isAnchorOnly ? 2 : 3 + levelsUp * 2;
  if (stage === 2) {
    return { stage, repeatStage: false };
  }

  const anchorAtLevel = levelsUp === 0 ? anchorContent : ascendContentItem(anchorContent, levelsUp);
  if (!anchorAtLevel) {
    return { stage, repeatStage: false };
  }

  const siblings = getContentSiblingsForItem(anchorAtLevel);
  return { stage, repeatStage: heads.length < siblings.length };
}

function getLevelsUpToParent(anchorContent: ListItemNode, parentList: ListNode): number | null {
  let current: ListItemNode | null = anchorContent;
  let levels = 0;
  while (current) {
    if (current.getParent() === parentList) {
      return levels;
    }
    current = getParentContentItem(current);
    levels += 1;
  }
  return null;
}

function isAncestorOfAnchor(candidate: ListItemNode, anchorContent: ListItemNode): boolean {
  let current: ListItemNode | null = anchorContent;
  while (current) {
    if (current.getKey() === candidate.getKey()) {
      return true;
    }
    current = getParentContentItem(current);
  }
  return false;
}

function findChildOnPath(ancestor: ListItemNode, anchorContent: ListItemNode): ListItemNode | null {
  let current: ListItemNode | null = anchorContent;
  let parent = getParentContentItem(current);
  while (parent) {
    if (parent.getKey() === ancestor.getKey()) {
      return current;
    }
    current = parent;
    parent = getParentContentItem(current);
  }
  return null;
}
