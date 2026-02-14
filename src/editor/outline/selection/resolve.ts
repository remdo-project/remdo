import type { ListItemNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { LexicalNode, RangeSelection } from 'lexical';
import { $getNodeByKey } from 'lexical';

import { reportInvariant } from '@/editor/invariant';
import { isChildrenWrapper } from '@/editor/outline/list-structure';
import { resolveContentItemFromNode } from '@/editor/outline/schema';

import { isPointAtBoundary } from './caret';
import { getContiguousSelectionHeads } from './heads';
import type { OutlineSelectionRange } from './model';
import { isEmptyNoteBody } from './note-body';
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
  lastDirection: 'up' | 'down' | null;
}

export function resolveSelectionPointItem(
  selection: RangeSelection,
  point: RangeSelection['anchor']
): ListItemNode | null {
  const pointNode = point.getNode();
  const direct = resolveContentItemFromNode(pointNode);
  if (direct) {
    const content = direct;
    const nextEmptySibling = resolveEmptySiblingFromBoundary(selection, point, pointNode, content);
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

  if (!isChildrenWrapper(child)) {
    return child;
  }

  const previous = child.getPreviousSibling();
  if ($isListItemNode(previous) && !isChildrenWrapper(previous)) {
    return previous;
  }

  return null;
}

function resolveEmptySiblingFromBoundary(
  selection: RangeSelection,
  point: RangeSelection['anchor'],
  pointNode: LexicalNode,
  contentItem: ListItemNode
): ListItemNode | null {
  const nextSibling = getNextContentSibling(contentItem);
  if (!nextSibling || !isEmptyNoteBody(nextSibling)) {
    return null;
  }
  const contentIsEmpty = isEmptyNoteBody(contentItem);

  if (selection.isCollapsed()) {
    if (!contentIsEmpty && point.type === 'element' && point.getNode() === contentItem) {
      const maxOffset = contentItem.getChildrenSize();
      if (point.offset >= maxOffset) {
        return nextSibling;
      }
      if (point.offset === 0) {
        return nextSibling;
      }
    }

    if ($isListItemNode(pointNode) && isChildrenWrapper(pointNode)) {
      return nextSibling;
    }
  }

  if (
    !selection.isCollapsed() &&
    point.type === 'element'
  ) {
    const anchorPoint = selection.anchor;
    const focusPoint = selection.focus;
    if ($isListItemNode(pointNode) && isChildrenWrapper(pointNode) && point.getNode() === pointNode) {
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

export function selectionMatchesPayload(selection: RangeSelection, payload: SnapPayload): boolean {
  const anchorItem = resolveSelectionPointItem(selection, selection.anchor);
  const focusItem = resolveSelectionPointItem(selection, selection.focus);
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
    : resolveSelectionPointItem(selection, selection.anchor);
  const focusNode = resolveSelectionPointItem(selection, selection.focus);
  if (!anchorNode || !focusNode) {
    return null;
  }

  const anchorContent = anchorNode;
  const focusContent = focusNode;
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

  const caretItems = noteItems;
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
  const anchorItem = resolveSelectionPointItem(selection, selection.anchor);
  if (!anchorItem) {
    return null;
  }
  const anchorContent = anchorItem;
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
    lastDirection: null,
  };
}
