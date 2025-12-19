import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';

import { reportInvariant } from '@/editor/invariant';
import { findNearestListItem, getContentListItem, isChildrenWrapper } from './list-structure';

// Returns the contiguous sibling slab that spans anchor/focus as the set of
// top-most selected heads (dropping descendants when an ancestor is selected).
// Returns an empty array when the selection cannot be normalized to a single sibling run.
export function getContiguousSelectionHeads(selection: RangeSelection): ListItemNode[] {
  if (selection.isCollapsed()) {
    return [];
  }

  const anchorItem = findNearestListItem(selection.anchor.getNode());
  const focusItem = findNearestListItem(selection.focus.getNode());
  if (!anchorItem || !focusItem) {
    reportInvariant({
      message: 'Selection anchor/focus is not within list items.',
      context: { hasAnchor: Boolean(anchorItem), hasFocus: Boolean(focusItem) },
    });
    return [];
  }

  const anchorContent = getContentListItem(anchorItem);
  const focusContent = getContentListItem(focusItem);
  const normalized = normalizeContentRange(anchorContent, focusContent);

  const parent = normalized.start.getParent();
  if (!parent || parent !== normalized.end.getParent() || !$isListNode(parent)) {
    reportInvariant({
      message: 'Selection heads do not share a list parent.',
      context: {
        startKey: normalized.start.getKey(),
        endKey: normalized.end.getKey(),
        hasParent: Boolean(parent),
      },
    });
    return [];
  }

  const siblings = getContentSiblings(parent);
  const startIndex = siblings.indexOf(normalized.start);
  const endIndex = siblings.indexOf(normalized.end);
  if (startIndex === -1 || endIndex === -1) {
    reportInvariant({
      message: 'Selection heads are not found among content siblings.',
      context: {
        startKey: normalized.start.getKey(),
        endKey: normalized.end.getKey(),
        siblingCount: siblings.length,
      },
    });
    return [];
  }

  const first = Math.min(startIndex, endIndex);
  const last = Math.max(startIndex, endIndex);
  return siblings.slice(first, last + 1);
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
    reportInvariant({
      message: 'List item parent is not a list node while resolving parent content',
      context: { itemKey: item.getKey(), parentType: parentList?.getType ? parentList.getType() : undefined },
    });
    return null;
  }

  const parentWrapper = parentList.getParent();
  if (!isChildrenWrapper(parentWrapper)) {
    // Top-level items have a RootNode parent; treat that as expected and avoid noisy reporting.
    const parentType = parentWrapper?.getType ? parentWrapper.getType() : undefined;
    if (parentType !== 'root') {
      reportInvariant({
        message: 'List item parent wrapper missing or malformed',
        context: { itemKey: item.getKey(), parentType },
      });
    }
    return null;
  }

  const parentContent = parentWrapper.getPreviousSibling();
  if ($isListItemNode(parentContent)) {
    return parentContent;
  }
  reportInvariant({
    message: 'Parent content sibling is not a list item',
    context: {
      itemKey: item.getKey(),
      parentSiblingType: parentContent?.getType ? parentContent.getType() : undefined,
    },
  });
  return null;
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
