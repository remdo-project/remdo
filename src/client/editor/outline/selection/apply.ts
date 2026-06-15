import type { ListItemNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';
import { $createRangeSelection, $getNodeByKey, $setSelection } from 'lexical';

import { resolveBoundaryPoint, resolveContentBoundaryPoint } from './caret';
import { getSubtreeTail } from './tree';

export type BoundaryMode = 'content' | 'subtree';

export function $applyCaretEdge(itemKey: string, edge: 'start' | 'end'): boolean {
  const targetItem = $getNodeByKey<ListItemNode>(itemKey);
  if (!targetItem) {
    return false;
  }

  // Always install a fresh RangeSelection rather than mutating the active one:
  // the committed selection's Points are frozen during a Lexical update, so
  // node.selectStart()/TextNode.select() would throw when they mutate them.
  const boundary = resolveContentBoundaryPoint(targetItem, edge) ?? resolveBoundaryPoint(targetItem, edge);
  const selection = $createRangeSelection();
  if (boundary) {
    selection.setTextNodeRange(boundary.node, boundary.offset, boundary.node, boundary.offset);
  } else {
    selection.anchor.set(targetItem.getKey(), 0, 'element');
    selection.focus.set(targetItem.getKey(), 0, 'element');
    selection.dirty = true;
  }
  $setSelection(selection);
  return true;
}

export function selectInlineContent(selection: RangeSelection, item: ListItemNode): boolean {
  const start = resolveContentBoundaryPoint(item, 'start');
  const end = resolveContentBoundaryPoint(item, 'end') ?? start;
  if (!start || !end) {
    return selectNoteBody(selection, item);
  }

  selection.setTextNodeRange(start.node, start.offset, end.node, end.offset);
  return true;
}

export function selectNoteBody(selection: RangeSelection, item: ListItemNode): boolean {
  return setSelectionBetweenItems(selection, item, item, 'content', 'content');
}

export function setSelectionBetweenItems(
  selection: RangeSelection,
  startItem: ListItemNode,
  endItem: ListItemNode,
  startMode: BoundaryMode,
  endMode: BoundaryMode
): boolean {
  if (applyElementRangeBetweenItems(selection, startItem, endItem, startMode, endMode)) {
    return true;
  }

  const start =
    startMode === 'content'
      ? resolveContentBoundaryPoint(startItem, 'start')
      : resolveBoundaryPoint(startItem, 'start');
  const end =
    endMode === 'content'
      ? resolveContentBoundaryPoint(endItem, 'end')
      : resolveBoundaryPoint(endItem, 'end');

  if (!start || !end) {
    return false;
  }

  selection.setTextNodeRange(start.node, start.offset, end.node, end.offset);
  return true;
}

function applyElementRangeBetweenItems(
  selection: RangeSelection,
  startItem: ListItemNode,
  endItem: ListItemNode,
  startMode: BoundaryMode,
  endMode: BoundaryMode
): boolean {
  const anchorItem = resolveElementBoundaryItem(startItem, startMode, 'start');
  const focusItem = resolveElementBoundaryItem(endItem, endMode, 'end');

  if (!anchorItem || !focusItem) {
    return false;
  }

  selection.anchor.set(anchorItem.getKey(), 0, 'element');
  selection.focus.set(focusItem.getKey(), focusItem.getChildrenSize(), 'element');
  selection.dirty = true;

  if (!selection.isCollapsed()) {
    return true;
  }

  if (anchorItem === focusItem) {
    const parent = anchorItem.getParent();
    if ($isListNode(parent)) {
      const index = anchorItem.getIndexWithinParent();
      if (index !== -1) {
        selection.anchor.set(parent.getKey(), index, 'element');
        selection.focus.set(parent.getKey(), index + 1, 'element');
        selection.dirty = true;
      }
    }
  }

  return true;
}

function resolveElementBoundaryItem(
  item: ListItemNode,
  mode: BoundaryMode,
  edge: 'start' | 'end'
): ListItemNode | null {
  if (mode === 'subtree' && edge === 'end') {
    const tail = getSubtreeTail(item);
    return tail;
  }

  return item;
}
