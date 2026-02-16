import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';

import { isChildrenWrapper } from './list-structure';

type TraverseResult = void | boolean;

function getNestedListForContentItem(item: ListItemNode): ListNode | null {
  const wrapper = item.getNextSibling();
  if (!isChildrenWrapper(wrapper)) {
    return null;
  }

  const nested = wrapper.getFirstChild();
  return $isListNode(nested) ? nested : null;
}

export function forEachContentItemInOutline(
  rootList: ListNode,
  visit: (item: ListItemNode) => TraverseResult
): void {
  interface ContentFrame {
    children: ReturnType<ListNode['getChildren']>;
    childIndex: number;
  }

  const stack: ContentFrame[] = [
    {
      children: rootList.getChildren(),
      childIndex: 0,
    },
  ];

  while (stack.length > 0) {
    const frame = stack.at(-1)!;
    if (frame.childIndex >= frame.children.length) {
      stack.pop();
      continue;
    }

    const child = frame.children[frame.childIndex];
    frame.childIndex += 1;
    if (!$isListItemNode(child) || isChildrenWrapper(child)) {
      continue;
    }

    if (visit(child) === false) {
      return;
    }

    const nested = getNestedListForContentItem(child);
    if (!nested) {
      continue;
    }

    stack.push({
      children: nested.getChildren(),
      childIndex: 0,
    });
  }
}

export function forEachContentItemWithAncestorsInOutline(
  rootList: ListNode,
  visit: (item: ListItemNode, ancestors: ListItemNode[]) => TraverseResult
): void {
  interface ContentFrame {
    children: ReturnType<ListNode['getChildren']>;
    childIndex: number;
    ancestors: ListItemNode[];
  }

  const stack: ContentFrame[] = [
    {
      children: rootList.getChildren(),
      childIndex: 0,
      ancestors: [],
    },
  ];

  while (stack.length > 0) {
    const frame = stack.at(-1)!;
    if (frame.childIndex >= frame.children.length) {
      stack.pop();
      continue;
    }

    const child = frame.children[frame.childIndex];
    frame.childIndex += 1;
    if (!$isListItemNode(child) || isChildrenWrapper(child)) {
      continue;
    }

    if (visit(child, frame.ancestors) === false) {
      return;
    }

    const nested = getNestedListForContentItem(child);
    if (!nested) {
      continue;
    }

    stack.push({
      children: nested.getChildren(),
      childIndex: 0,
      ancestors: [...frame.ancestors, child],
    });
  }
}

export function forEachListItemInOutline(
  rootList: ListNode,
  visit: (item: ListItemNode) => TraverseResult
): void {
  const stack: ListNode[] = [rootList];

  while (stack.length > 0) {
    const currentList = stack.pop()!;
    const children = currentList.getChildren();
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (!$isListItemNode(child)) {
        continue;
      }

      if (visit(child) === false) {
        return;
      }

      if (!isChildrenWrapper(child)) {
        continue;
      }

      const nested = child.getFirstChild();
      if ($isListNode(nested)) {
        stack.push(nested);
      }
    }
  }
}
