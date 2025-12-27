import type { ListItemNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import type { LexicalNode, RangeSelection, TextNode } from 'lexical';
import { $createRangeSelection, $isTextNode, $setSelection } from 'lexical';

import { findNearestListItem, getContentListItem } from '@/editor/outline/list-structure';

type Edge = 'start' | 'end';

function findBoundaryTextNode(node: LexicalNode, edge: Edge): TextNode | null {
  if ($isTextNode(node)) {
    return node;
  }

  const canTraverse = typeof (node as { getChildren?: () => LexicalNode[] }).getChildren === 'function';
  if (!canTraverse) {
    return null;
  }

  const children = (node as { getChildren?: () => LexicalNode[] }).getChildren?.() ?? [];
  const ordered = edge === 'start' ? children : children.toReversed();

  for (const child of ordered) {
    if ($isListNode(child)) {
      continue;
    }

    const match = findBoundaryTextNode(child, edge);
    if (match) {
      return match;
    }
  }

  return null;
}

export function resolveBoundaryPoint(listItem: ListItemNode, edge: Edge) {
  const textNode = findBoundaryTextNode(listItem, edge);
  if (!textNode) {
    return null;
  }

  const length = textNode.getTextContentSize();
  const offset = edge === 'start' ? 0 : length;
  return { node: textNode, offset } as const;
}

function findContentBoundaryTextNode(listItem: ListItemNode, edge: Edge): TextNode | null {
  const children = listItem.getChildren();
  const ordered = edge === 'start' ? children : children.toReversed();

  for (const child of ordered) {
    if ($isListNode(child)) {
      continue;
    }

    const match = findBoundaryTextNode(child, edge);
    if (match) {
      return match;
    }
  }

  return null;
}

export function resolveContentBoundaryPoint(listItem: ListItemNode, edge: Edge) {
  const textNode = findContentBoundaryTextNode(listItem, edge);
  if (!textNode) {
    return null;
  }

  const length = textNode.getTextContentSize();
  const offset = edge === 'start' ? 0 : length;
  return { node: textNode, offset } as const;
}

export function isPointAtBoundary(
  point: RangeSelection['anchor'],
  listItem: ListItemNode,
  edge: Edge
): boolean {
  const boundary = resolveBoundaryPoint(listItem, edge);
  if (!boundary) {
    return false;
  }

  const node = point.getNode();
  if (!$isTextNode(node)) {
    return false;
  }

  return node.getKey() === boundary.node.getKey() && point.offset === boundary.offset;
}

export function shouldBlockHorizontalExpansion(
  point: RangeSelection['anchor'],
  listItem: ListItemNode,
  edge: Edge
): boolean {
  const boundary = resolveContentBoundaryPoint(listItem, edge);
  if (!boundary) {
    return true;
  }

  const node = point.getNode();
  if (!$isTextNode(node)) {
    return true;
  }

  return node.getKey() === boundary.node.getKey() && point.offset === boundary.offset;
}

export function $selectItemEdge(item: ListItemNode, edge: Edge): boolean {
  const contentItem = getContentListItem(item);
  const selectable = contentItem as ListItemNode & { selectStart?: () => void; selectEnd?: () => void };
  const selectEdge = edge === 'start' ? selectable.selectStart : selectable.selectEnd;

  if (typeof selectEdge === 'function') {
    selectEdge.call(selectable);
    return true;
  }

  const boundary = resolveBoundaryPoint(contentItem, edge);
  if (!boundary) {
    return false;
  }

  const range = $createRangeSelection();
  range.setTextNodeRange(boundary.node, boundary.offset, boundary.node, boundary.offset);
  $setSelection(range);
  return true;
}

export function collapseSelectionToCaret(selection: RangeSelection): boolean {
  const anchorNode = selection.anchor.getNode();

  if ($isTextNode(anchorNode)) {
    selection.setTextNodeRange(anchorNode, selection.anchor.offset, anchorNode, selection.anchor.offset);
    return true;
  }

  const anchorItem = findNearestListItem(anchorNode);
  if (!anchorItem) {
    return false;
  }

  const caretPoint = resolveContentBoundaryPoint(getContentListItem(anchorItem), 'start');
  if (!caretPoint) {
    return false;
  }

  selection.setTextNodeRange(caretPoint.node, caretPoint.offset, caretPoint.node, caretPoint.offset);
  return true;
}
