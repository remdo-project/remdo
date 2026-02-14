import type { ListItemNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import type { RangeSelection, TextNode } from 'lexical';
import { $createRangeSelection, $getNodeByKey, $setSelection } from 'lexical';

import { resolveBoundaryPoint, resolveContentBoundaryPoint } from './caret';
import { getSubtreeTail } from './tree';

export type BoundaryMode = 'content' | 'subtree';

export function $applyCaretEdge(itemKey: string, edge: 'start' | 'end'): boolean {
  const targetItem = $getNodeByKey<ListItemNode>(itemKey);
  if (!targetItem) {
    return false;
  }

  const contentItem = targetItem;
  const selectableContent = contentItem as ListItemNode & {
    selectStart?: () => RangeSelection;
    selectEnd?: () => RangeSelection;
  };
  const selectEdge = edge === 'start' ? selectableContent.selectStart : selectableContent.selectEnd;

  if (typeof selectEdge === 'function') {
    selectEdge.call(selectableContent);
    return true;
  }

  const boundary = resolveContentBoundaryPoint(contentItem, edge) ?? resolveBoundaryPoint(contentItem, edge);
  if (!boundary) {
    const selection = $createRangeSelection();
    selection.anchor.set(contentItem.getKey(), 0, 'element');
    selection.focus.set(contentItem.getKey(), 0, 'element');
    selection.dirty = true;
    $setSelection(selection);
    return true;
  }

  const selectable = boundary.node as TextNode & { select?: (anchor: number, focus: number) => void };
  if (typeof selectable.select === 'function') {
    const offset = boundary.offset;
    selectable.select(offset, offset);
    return true;
  }

  const selection = $createRangeSelection();
  selection.setTextNodeRange(boundary.node, boundary.offset, boundary.node, boundary.offset);
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
