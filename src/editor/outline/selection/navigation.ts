import type { ListItemNode } from '@lexical/list';
import { $getSelection, $isRangeSelection } from 'lexical';

import { findNearestListItem, getContentListItem } from '@/editor/outline/list-structure';

import { shouldBlockHorizontalExpansion } from './caret';

export function $shouldBlockHorizontalArrow(direction: 'left' | 'right'): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  const selectionListItems: ListItemNode[] = [];
  const seen = new Set<string>();
  for (const node of selection.getNodes()) {
    const listItem = findNearestListItem(node);
    if (!listItem) continue;
    const key = listItem.getKey();
    if (seen.has(key)) continue;
    seen.add(key);
    selectionListItems.push(listItem);
  }

  const isCollapsed = selection.isCollapsed();
  if (!isCollapsed && selectionListItems.length > 1) {
    return true; // already structural, block horizontal expansion
  }

  const targetItem =
    selectionListItems[0] ??
    (isCollapsed ? findNearestListItem(selection.focus.getNode()) : null);
  if (!targetItem) {
    return false;
  }

  const contentItem = getContentListItem(targetItem);
  const focus = selection.focus;
  const edge = direction === 'left' ? 'start' : 'end';
  return shouldBlockHorizontalExpansion(focus, contentItem, edge);
}
