import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';

import { findNearestListItem, getContentListItem, isChildrenWrapper } from './list-structure';

export interface ContiguousSelectionSlice {
  heads: ListItemNode[];
  slab: ListItemNode[];
}

// Returns the contiguous sibling slab that spans the anchor/focus notes and the
// top-most selected heads (dropping descendants when an ancestor is selected).
// Returns null when the selection cannot be normalized to a single sibling run.
export function getContiguousSelectionHeads(selection: RangeSelection): ContiguousSelectionSlice | null {
  if (selection.isCollapsed()) {
    return null;
  }

  const anchorItem = findNearestListItem(selection.anchor.getNode());
  const focusItem = findNearestListItem(selection.focus.getNode());
  if (!anchorItem || !focusItem) {
    return null;
  }

  const anchorContent = getContentListItem(anchorItem);
  const focusContent = getContentListItem(focusItem);
  const normalized = normalizeContentRange(anchorContent, focusContent);

  const parent = normalized.start.getParent();
  if (!parent || parent !== normalized.end.getParent() || !$isListNode(parent)) {
    return null;
  }

  const siblings = getContentSiblings(parent);
  const startIndex = siblings.indexOf(normalized.start);
  const endIndex = siblings.indexOf(normalized.end);
  if (startIndex === -1 || endIndex === -1) {
    return null;
  }

  const first = Math.min(startIndex, endIndex);
  const last = Math.max(startIndex, endIndex);
  const slab = siblings.slice(first, last + 1);

  // TODO: if slab is never used separately (e.g., SelectionPlugin adopts this
  // helper for visualization), consider returning only heads to reduce churn.
  // Collapse to heads: within a sibling slab, no item is a descendant of
  // another, so heads equal the slab. Kept explicit for clarity and future
  // mixed-depth handling.
  const heads = slab;

  return { heads, slab } satisfies ContiguousSelectionSlice;
}

function normalizeContentRange(start: ListItemNode, end: ListItemNode): { start: ListItemNode; end: ListItemNode } {
  let first = start;
  let last = end;

  if (first !== last && !first.isBefore(last)) {
    [first, last] = [last, first];
  }

  let firstDepth = getContentDepth(first);
  let lastDepth = getContentDepth(last);

  while (firstDepth > lastDepth) {
    const parent = getParentContentItem(first);
    if (!parent) {
      break;
    }
    first = parent;
    firstDepth -= 1;
  }

  while (lastDepth > firstDepth) {
    const parent = getParentContentItem(last);
    if (!parent) {
      break;
    }
    last = parent;
    lastDepth -= 1;
  }

  let firstParent = first.getParent();
  let lastParent = last.getParent();
  while (firstParent && lastParent && firstParent !== lastParent) {
    const nextFirst = getParentContentItem(first);
    const nextLast = getParentContentItem(last);
    if (!nextFirst || !nextLast) {
      break;
    }
    first = nextFirst;
    last = nextLast;
    firstParent = first.getParent();
    lastParent = last.getParent();
  }

  return { start: first, end: last } as const;
}

function getContentDepth(item: ListItemNode): number {
  let depth = 0;
  let current: ListItemNode | null = getParentContentItem(item);
  while (current) {
    depth += 1;
    current = getParentContentItem(current);
  }
  return depth;
}

function getParentContentItem(item: ListItemNode): ListItemNode | null {
  const parentList = item.getParent();
  if (!$isListNode(parentList)) {
    return null;
  }

  const parentWrapper = parentList.getParent();
  if (!$isListItemNode(parentWrapper) || !isChildrenWrapper(parentWrapper)) {
    return null;
  }

  const parentContent = parentWrapper.getPreviousSibling();
  return $isListItemNode(parentContent) ? parentContent : null;
}

function getContentSiblings(list: ListNode): ListItemNode[] {
  const items: ListItemNode[] = [];
  for (const child of list.getChildren()) {
    if ($isListItemNode(child) && !isChildrenWrapper(child)) {
      items.push(child);
    }
  }
  return items;
}
