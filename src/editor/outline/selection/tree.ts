import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { LexicalNode } from 'lexical';

import { reportInvariant } from '@/editor/invariant';
import { getContentListItem, getContentSiblings, isChildrenWrapper, maybeRemoveEmptyWrapper } from '../list-structure';

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
    if ($isListItemNode(sibling) && !isChildrenWrapper(sibling)) {
      return sibling;
    }
    sibling = sibling.getNextSibling();
  }
  return null;
}

export function getSubtreeTail(item: ListItemNode): ListItemNode {
  const nestedList = getNestedList(item);
  if (!nestedList) {
    return item;
  }

  const lastChild = nestedList.getLastChild();
  if (!$isListItemNode(lastChild)) {
    return item;
  }

  return getSubtreeTail(lastChild);
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
  const content = getContentListItem(item);
  const items: ListItemNode[] = [content];
  const nested = getNestedList(content);
  if (!nested) {
    return items;
  }

  for (const child of nested.getChildren()) {
    if ($isListItemNode(child) && !isChildrenWrapper(child)) {
      items.push(...getSubtreeItems(child));
    }
  }

  return items;
}

export function getFirstDescendantListItem(node: LexicalNode | null): ListItemNode | null {
  if (!$isListNode(node)) {
    return null;
  }

  for (const child of node.getChildren()) {
    if ($isListItemNode(child)) {
      return getContentListItem(child);
    }
  }

  return null;
}

export function getLastDescendantListItem(node: LexicalNode | null): ListItemNode | null {
  if (!$isListNode(node)) {
    return null;
  }

  const children = node.getChildren();
  for (let i = children.length - 1; i >= 0; i -= 1) {
    const child = children[i];
    if ($isListItemNode(child)) {
      const nested = getNestedList(child);
      const match = getLastDescendantListItem(nested);
      if (match) {
        return match;
      }
      return getContentListItem(child);
    }
  }

  return null;
}

export function getWrapperForContent(item: ListItemNode): ListItemNode | null {
  const next = item.getNextSibling();
  if (!isChildrenWrapper(next)) {
    return null;
  }
  return next;
}

export function removeNoteSubtree(item: ListItemNode) {
  const parentList = item.getParent();
  const parentWrapper = $isListNode(parentList) ? parentList.getParent() : null;

  const wrapper = getWrapperForContent(item);
  if (wrapper) {
    wrapper.remove();
  }

  item.remove();

  if ($isListNode(parentList)) {
    maybeRemoveEmptyWrapper(parentList);
    if ($isListItemNode(parentWrapper) && parentWrapper.getChildrenSize() === 0) {
      parentWrapper.remove();
    }
  }
}

export function compareDocumentOrder(a: ListItemNode, b: ListItemNode): number {
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

export function getContentDepth(item: ListItemNode): number {
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

export function findLowestCommonContentAncestor(left: ListItemNode, right: ListItemNode): ListItemNode | null {
  const leftKeys = new Set<string>();
  let current: ListItemNode | null = left;
  while (current) {
    leftKeys.add(current.getKey());
    current = getParentContentItem(current);
  }

  current = right;
  while (current) {
    if (leftKeys.has(current.getKey())) {
      return current;
    }
    current = getParentContentItem(current);
  }

  return null;
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
