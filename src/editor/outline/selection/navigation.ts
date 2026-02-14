import type { ListItemNode } from '@lexical/list';
import { $getSelection, $isRangeSelection } from 'lexical';

import { resolveContentItemFromNode } from '@/editor/outline/schema';

import { shouldBlockHorizontalExpansion } from './caret';

export function $shouldBlockHorizontalArrow(direction: 'left' | 'right'): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  const selectionListItems: ListItemNode[] = [];
  const seen = new Set<string>();
  for (const node of selection.getNodes()) {
    const contentItem = resolveContentItemFromNode(node);
    if (!contentItem) continue;
    const key = contentItem.getKey();
    if (seen.has(key)) continue;
    seen.add(key);
    selectionListItems.push(contentItem);
  }

  const isCollapsed = selection.isCollapsed();
  if (!isCollapsed && selectionListItems.length > 1) {
    return true; // already structural, block horizontal expansion
  }

  const targetItem =
    selectionListItems[0] ??
    (isCollapsed ? resolveContentItemFromNode(selection.focus.getNode()) : null);
  if (!targetItem) {
    return false;
  }

  const focus = selection.focus;
  const edge = direction === 'left' ? 'start' : 'end';
  return shouldBlockHorizontalExpansion(focus, targetItem, edge);
}
