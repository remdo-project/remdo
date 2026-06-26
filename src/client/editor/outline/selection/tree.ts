import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { LexicalNode } from 'lexical';

import { reportInvariant } from '#client/editor/invariant';
import { isBodyWrapper } from '#client/editor/features/note-body/note-body-node';
import { getBodyWrapper, getContentSiblings, getPreviousContentSibling, isChildrenWrapper, isContentItem, maybeRemoveEmptyWrapper } from '../list-structure';

export function normalizeContentRange(
  start: ListItemNode,
  end: ListItemNode
): { start: ListItemNode; end: ListItemNode } {
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

export function getParentContentItem(item: ListItemNode): ListItemNode | null {
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
    const parentType = parentWrapper?.getType ? parentWrapper.getType() : undefined;
    if (parentType !== 'root') {
      reportInvariant({
        message: 'List item parent wrapper missing or malformed',
        context: { itemKey: item.getKey(), parentType },
      });
    }
    return null;
  }

  // The parent note sits before the children-wrapper, after any body-wrapper.
  const parentContent = getPreviousContentSibling(parentWrapper);
  if (parentContent) {
    return parentContent;
  }

  reportInvariant({
    message: 'Parent content sibling is not a list item',
    context: {
      itemKey: item.getKey(),
      parentSiblingType: parentWrapper.getPreviousSibling()?.getType(),
    },
  });
  return null;
}

export function getContentSiblingsForItem(item: ListItemNode): ListItemNode[] {
  const parentList = item.getParent();
  if (!$isListNode(parentList)) {
    return [item];
  }

  const siblings = getContentSiblings(parentList);
  return siblings.length === 0 ? [item] : siblings;
}

export function getNextContentSibling(item: ListItemNode): ListItemNode | null {
  let sibling: LexicalNode | null = item.getNextSibling();
  while (sibling) {
    if (isContentItem(sibling)) {
      return sibling;
    }
    sibling = sibling.getNextSibling();
  }
  return null;
}

export function getSubtreeTail(item: ListItemNode): ListItemNode {
  let current = item;
  let nestedList = getNestedList(current);
  while (nestedList) {
    // The last list child can be a trailing wrapper (a body-wrapper, or a
    // children-wrapper for a nested subtree); the subtree tail is the deepest
    // content note, so take the last content sibling.
    const lastChild = getContentSiblings(nestedList).at(-1);
    if (!lastChild) {
      break;
    }

    current = lastChild;
    nestedList = getNestedList(current);
  }

  return current;
}

export function getNestedList(item: ListItemNode): ListNode | null {
  const wrapper = getWrapperForContent(item);
  if (wrapper) {
    const nested = wrapper.getFirstChild();
    if ($isListNode(nested)) {
      return nested;
    }
  }
  return null;
}

export function noteHasChildren(item: ListItemNode): boolean {
  const nested = getNestedList(item);
  if (!nested) {
    return false;
  }
  return getContentSiblings(nested).length > 0;
}

export function getSubtreeItems(item: ListItemNode): ListItemNode[] {
  const items: ListItemNode[] = [];
  const stack: ListItemNode[] = [item];

  while (stack.length > 0) {
    const current = stack.pop()!;
    items.push(current);

    const nested = getNestedList(current);
    if (!nested) {
      continue;
    }

    const children = nested.getChildren();
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (isContentItem(child)) {
        stack.push(child);
      }
    }
  }

  return items;
}

export function getFirstDescendantListItem(node: LexicalNode | null): ListItemNode | null {
  if (!$isListNode(node)) {
    return null;
  }

  for (const child of node.getChildren()) {
    if (isContentItem(child)) {
      return child;
    }
  }

  return null;
}

export function getLastDescendantListItem(node: LexicalNode | null): ListItemNode | null {
  if (!$isListNode(node)) {
    return null;
  }

  let currentList: ListNode | null = node;
  let fallback: ListItemNode | null = null;

  while (currentList) {
    const children = currentList.getChildren();
    let lastContentChild: ListItemNode | null = null;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (isContentItem(child)) {
        lastContentChild = child;
        break;
      }
    }

    if (!lastContentChild) {
      return fallback;
    }

    fallback = lastContentChild;
    const nested = getNestedList(lastContentChild);
    currentList = nested;
  }

  return fallback;
}

export function getWrapperForContent(item: ListItemNode): ListItemNode | null {
  // The children-wrapper sits after the note, after any body-wrapper.
  let next = item.getNextSibling();
  if (isBodyWrapper(next)) {
    next = next.getNextSibling();
  }
  return isChildrenWrapper(next) ? next : null;
}

export function removeNoteSubtree(item: ListItemNode) {
  const parentList = item.getParent();
  const parentWrapper = $isListNode(parentList) ? parentList.getParent() : null;

  const wrapper = getWrapperForContent(item);
  if (wrapper) {
    wrapper.remove();
  }

  // The body-wrapper (if any) travels with the note.
  const bodyWrapper = getBodyWrapper(item);
  if (bodyWrapper) {
    bodyWrapper.remove();
  }

  item.remove();

  if ($isListNode(parentList)) {
    maybeRemoveEmptyWrapper(parentList);
    if ($isListItemNode(parentWrapper) && parentWrapper.getChildrenSize() === 0) {
      parentWrapper.remove();
    }
  }
}

export function removeNoteHeads(heads: readonly ListItemNode[]): boolean {
  if (heads.length === 0) {
    return false;
  }

  for (let i = heads.length - 1; i >= 0; i -= 1) {
    removeNoteSubtree(heads[i]!);
  }
  return true;
}

function compareDocumentOrder(a: ListItemNode, b: ListItemNode): number {
  const aPath = getNodePath(a);
  const bPath = getNodePath(b);
  const depth = Math.max(aPath.length, bPath.length);

  for (let i = 0; i < depth; i += 1) {
    const left = aPath[i] ?? -1;
    const right = bPath[i] ?? -1;
    if (left !== right) {
      return left - right;
    }
  }

  return 0;
}

export function sortHeadsByDocumentOrder(heads: ListItemNode[]): ListItemNode[] {
  return heads.toSorted(compareDocumentOrder);
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

export function isContentDescendantOf(candidate: ListItemNode, ancestor: ListItemNode): boolean {
  let current: ListItemNode | null = candidate;
  while (current) {
    if (current.getKey() === ancestor.getKey()) {
      return true;
    }
    current = getParentContentItem(current);
  }
  return false;
}

// True when `item` is `boundary` or a content-descendant of it. A null boundary
// means "no limit" — everything is within. Generic tree geometry: callers supply
// the boundary node (zoom supplies the zoom root; see features/zoom/zoom-root.ts).
export function isWithinBoundary(item: ListItemNode, boundary: ListItemNode | null): boolean {
  return boundary === null || isContentDescendantOf(item, boundary);
}

function getNodePath(node: ListItemNode): number[] {
  const path: number[] = [];
  let child: LexicalNode = node;
  let parent: LexicalNode | null = child.getParent();

  while (parent) {
    path.push(child.getIndexWithinParent());
    child = parent;
    parent = child.getParent();
  }

  return path.toReversed();
}

// getNestedList + getWrapperForContent exported above
