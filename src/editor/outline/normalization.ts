import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from '@lexical/list';
import type { RootNode } from 'lexical';
import { $createParagraphNode } from 'lexical';

import { insertBefore, isChildrenWrapper } from '@/editor/outline/list-structure';

export function $normalizeOutlineRoot(root: RootNode): void {
  $ensureSingleListRoot(root);
}

export function $normalizeOutlineList(list: ListNode): void {
  normalizeOrphanWrappers(list);
}

export function $normalizeOutlineListItem(item: ListItemNode): void {
  if (!isChildrenWrapper(item) || !item.isAttached()) {
    return;
  }
  const parent = item.getParent();
  if ($isListNode(parent)) {
    normalizeOrphanWrappers(parent);
  }
}

export function $shouldNormalizeOutlineRoot(root: RootNode): boolean {
  if ($needsListNormalization(root)) {
    return true;
  }

  const list = root.getFirstChild();
  if (!$isListNode(list)) {
    return true;
  }

  return hasOrphanWrapper(list);
}

function $ensureSingleListRoot(root: RootNode) {
  if (!$needsListNormalization(root)) {
    const existing = root.getFirstChild();
    if ($isListNode(existing)) {
      normalizeOrphanWrappers(existing);
    }
    return;
  }

  // Ensure exactly one root list, preferring the existing list type when present.
  const rootChildren = root.getChildren();
  const firstChild = rootChildren[0];
  const existingList = rootChildren.find($isListNode);
  const canonicalListType = existingList?.getListType() ?? 'bullet';

  let canonicalList: ListNode;
  if ($isListNode(firstChild)) {
    canonicalList = firstChild;
  } else {
    canonicalList = $createListNode(canonicalListType);
    if (firstChild) {
      firstChild.insertBefore(canonicalList);
    } else {
      root.append(canonicalList);
    }
  }

  // Move/merge all other root children into the canonical list.
  const mergeType = canonicalList.getListType();
  for (const child of rootChildren) {
    if (child === canonicalList) continue;

    // Merge lists of the same type by lifting their items.
    if ($isListNode(child) && child.getListType() === mergeType) {
      canonicalList.append(...child.getChildren()); // moves nodes, keeps keys
      child.remove();
      continue;
    }

    // Wrap any other node into a list item to preserve content.
    const li = $createListItemNode();
    child.remove();
    li.append(child);
    canonicalList.append(li);
  }

  // Ensure at least one list item with a paragraph exists.
  if (canonicalList.getChildrenSize() === 0) {
    const li = $createListItemNode();
    li.append($createParagraphNode());
    canonicalList.append(li);
  }

  normalizeOrphanWrappers(canonicalList);
}

/**
 * Returns true when the root diverges from our canonical single-list shape.
 * Assumes Lexical's ListPlugin already keeps list children as ListItemNodes.
 */
function $needsListNormalization(root: RootNode): boolean {
  const first = root.getFirstChild();
  if (!$isListNode(first)) {
    return true;
  }

  if (first.getNextSibling() !== null) {
    return true;
  }

  if (first.getChildrenSize() === 0) {
    return true;
  }

  for (const child of first.getChildren()) {
    if (!$isListItemNode(child)) {
      return true;
    }
  }

  return false;
}

function hasOrphanWrapper(list: ListNode): boolean {
  for (const child of list.getChildren()) {
    if (!$isListItemNode(child)) {
      continue;
    }

    if (!isChildrenWrapper(child)) {
      continue;
    }

    const previous = child.getPreviousSibling();
    if (!$isListItemNode(previous) || isChildrenWrapper(previous)) {
      return true;
    }

    const nested = child.getFirstChild();
    if ($isListNode(nested) && hasOrphanWrapper(nested)) {
      return true;
    }
  }
  return false;
}

function normalizeOrphanWrappers(list: ListNode): void {
  const children = list.getChildren();

  for (const child of children) {
    if (!$isListItemNode(child) || !isChildrenWrapper(child) || !child.isAttached()) {
      continue;
    }

    const previousContent = findPreviousContentSibling(child);
    if (!previousContent) {
      hoistWrapperChildren(child);
      continue;
    }

    if (child.getPreviousSibling() === previousContent) {
      const nested = child.getFirstChild();
      if ($isListNode(nested)) {
        normalizeOrphanWrappers(nested);
      }
      continue;
    }

    const previousWrapper = previousContent.getNextSibling();
    if (isChildrenWrapper(previousWrapper)) {
      const targetList = previousWrapper.getFirstChild();
      const nestedList = child.getFirstChild();
      if ($isListNode(targetList) && $isListNode(nestedList)) {
        targetList.append(...nestedList.getChildren());
      }
      child.remove();
      if ($isListNode(targetList)) {
        normalizeOrphanWrappers(targetList);
      }
      continue;
    }

    hoistWrapperChildren(child);
  }
}

function findPreviousContentSibling(node: ListItemNode): ListItemNode | null {
  let sibling = node.getPreviousSibling();
  while (sibling) {
    if ($isListItemNode(sibling) && !isChildrenWrapper(sibling)) {
      return sibling;
    }
    sibling = sibling.getPreviousSibling();
  }
  return null;
}

function hoistWrapperChildren(wrapper: ListItemNode): void {
  const nestedList = wrapper.getFirstChild();
  if ($isListNode(nestedList)) {
    const nestedItems = nestedList.getChildren();
    if (nestedItems.length > 0) {
      insertBefore(wrapper, nestedItems);
    }
  }
  wrapper.remove();
}
