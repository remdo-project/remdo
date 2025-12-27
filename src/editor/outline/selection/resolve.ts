import type { ListItemNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';
import { $getNodeByKey } from 'lexical';

import { reportInvariant } from '@/editor/invariant';
import { findNearestListItem, getContentListItem, isChildrenWrapper } from '@/editor/outline/list-structure';

import { isPointAtBoundary } from './caret';
import { getContiguousSelectionHeads } from './heads';
import type { OutlineSelectionRange } from './model';
import { getNextContentSibling, getSubtreeTail, normalizeContentRange } from './tree';

export interface SnapPayload {
  anchorKey: string;
  focusKey: string;
  anchorEdge: 'start' | 'end';
  focusEdge: 'start' | 'end';
}

export interface ProgressiveSelectionState {
  anchorKey: string | null;
  stage: number;
  locked: boolean;
}

export function resolveSelectionPointItem(
  selection: RangeSelection,
  point: RangeSelection['anchor']
): ListItemNode | null {
  const direct = findNearestListItem(point.getNode());
  if (direct) {
    const content = getContentListItem(direct);
    const nextEmptySibling = resolveEmptySiblingFromBoundary(selection, point, direct, content);
    if (nextEmptySibling) {
      return nextEmptySibling;
    }

    return content;
  }

  if (point.type !== 'element') {
    return null;
  }

  const node = point.getNode();
  if (!$isListNode(node)) {
    return null;
  }

  const children = node.getChildren();
  if (children.length === 0) {
    return null;
  }

  const clampedIndex = Math.max(0, Math.min(point.offset, children.length - 1));
  const child = children[clampedIndex];
  if (!$isListItemNode(child)) {
    return null;
  }

  return getContentListItem(child);
}

function resolveEmptySiblingFromBoundary(
  selection: RangeSelection,
  point: RangeSelection['anchor'],
  directItem: ListItemNode,
  contentItem: ListItemNode
): ListItemNode | null {
  const nextSibling = getNextContentSibling(contentItem);
  if (!nextSibling || !isEmptyNoteBody(nextSibling)) {
    return null;
  }
  const contentIsEmpty = isEmptyNoteBody(contentItem);

  if (selection.isCollapsed()) {
    if (point.type === 'text' && isPointAtBoundary(point, contentItem, 'end')) {
      return nextSibling;
    }

    if (!contentIsEmpty && point.type === 'element' && point.getNode() === contentItem) {
      const maxOffset = contentItem.getChildrenSize();
      if (point.offset >= maxOffset) {
        return nextSibling;
      }
      if (point.offset === 0) {
        return nextSibling;
      }
    }

    if (isChildrenWrapper(directItem)) {
      return nextSibling;
    }
  }

  if (
    !selection.isCollapsed() &&
    point.type === 'element'
  ) {
    const anchorPoint = selection.anchor;
    const focusPoint = selection.focus;
    if (isChildrenWrapper(directItem) && point.getNode() === directItem) {
      return nextSibling;
    }

    if (
      !contentIsEmpty &&
      anchorPoint.type === 'element' &&
      focusPoint.type === 'element' &&
      anchorPoint.getNode() === contentItem &&
      focusPoint.getNode() === contentItem
    ) {
      const maxOffset = contentItem.getChildrenSize();
      const coversForward = anchorPoint.offset === 0 && focusPoint.offset >= maxOffset;
      const coversBackward = focusPoint.offset === 0 && anchorPoint.offset >= maxOffset;
      if (coversForward || coversBackward) {
        return nextSibling;
      }
    }
  }

  return null;
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

export function selectionMatchesPayload(selection: RangeSelection, payload: SnapPayload): boolean {
  const anchorItem = findNearestListItem(selection.anchor.getNode());
  const focusItem = findNearestListItem(selection.focus.getNode());
  if (!anchorItem || !focusItem) {
    return false;
  }

  if (anchorItem.getKey() !== payload.anchorKey || focusItem.getKey() !== payload.focusKey) {
    return false;
  }

  return (
    isPointAtBoundary(selection.anchor, anchorItem, payload.anchorEdge) &&
    isPointAtBoundary(selection.focus, focusItem, payload.focusEdge)
  );
}

export function $createSnapPayload(
  selection: RangeSelection,
  items: ListItemNode[],
  overrideAnchorKey?: string | null
): SnapPayload | null {
  if (items.length === 0) {
    return null;
  }

  const anchorNode = overrideAnchorKey
    ? $getNodeByKey<ListItemNode>(overrideAnchorKey)
    : findNearestListItem(selection.anchor.getNode());
  const focusNode = findNearestListItem(selection.focus.getNode());
  if (!anchorNode || !focusNode) {
    return null;
  }

  const anchorContent = getContentListItem(anchorNode);
  const focusContent = getContentListItem(focusNode);
  const normalizedRange = normalizeContentRange(anchorContent, focusContent);
  const startContent = normalizedRange.start;
  const endContent = normalizedRange.end;
  const isBackward = selection.isBackward();
  const structuralStart = startContent;
  const structuralEnd = getSubtreeTail(endContent);
  const anchorBoundary = isBackward ? structuralEnd : structuralStart;
  const focusBoundary = isBackward ? structuralStart : structuralEnd;

  return {
    anchorKey: anchorBoundary.getKey(),
    focusKey: focusBoundary.getKey(),
    anchorEdge: isBackward ? 'end' : 'start',
    focusEdge: isBackward ? 'start' : 'end',
  } satisfies SnapPayload;
}

export function computeStructuralRangeFromHeads(heads: ListItemNode[]): OutlineSelectionRange | null {
  const noteItems = heads;
  if (noteItems.length === 0) {
    reportInvariant({
      message: 'Structural range computed with no heads',
    });
    return null;
  }

  const caretItems = noteItems.map((item) => getContentListItem(item));
  const caretStartItem = caretItems[0]!;
  const caretEndItem = caretItems.at(-1)!;
  const visualEndItem = getSubtreeTail(caretEndItem);

  return {
    caretStartKey: caretStartItem.getKey(),
    caretEndKey: caretEndItem.getKey(),
    visualStartKey: caretStartItem.getKey(),
    visualEndKey: visualEndItem.getKey(),
  } satisfies OutlineSelectionRange;
}

export function inferPointerProgressionState(
  selection: RangeSelection,
  noteItems: ListItemNode[]
): ProgressiveSelectionState | null {
  const anchorItem = findNearestListItem(selection.anchor.getNode());
  if (!anchorItem) {
    return null;
  }
  const anchorContent = getContentListItem(anchorItem);
  const heads = noteItems.length > 0 ? noteItems : getContiguousSelectionHeads(selection);
  if (heads.length <= 1) {
    return null;
  }
  const firstParent = heads[0]!.getParent();
  if (!heads.every((head: ListItemNode) => head.getParent() === firstParent)) {
    return null;
  }

  return {
    anchorKey: anchorContent.getKey(),
    stage: 3,
    locked: true,
  };
}
