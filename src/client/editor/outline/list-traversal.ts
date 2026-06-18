import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { LexicalNode } from 'lexical';

import { isBodyWrapper } from '#client/editor/features/note-body/note-body-node';
import { getBodyWrapper, isChildrenWrapper } from './list-structure';

const isWrapperItem = (node: LexicalNode): boolean => isChildrenWrapper(node) || isBodyWrapper(node);

type TraverseResult = void | boolean;
type ContentItemVisitor = (item: ListItemNode, ancestors: ListItemNode[]) => TraverseResult;

interface ContentFrame {
  children: ReturnType<ListNode['getChildren']>;
  childIndex: number;
  ancestors: ListItemNode[];
}

function getNestedListForContentItem(item: ListItemNode): ListNode | null {
  // The children-wrapper sits after the note, after any body-wrapper.
  const bodyWrapper = getBodyWrapper(item);
  const wrapper = (bodyWrapper ?? item).getNextSibling();
  if (!isChildrenWrapper(wrapper)) {
    return null;
  }

  const nested = wrapper.getFirstChild();
  return $isListNode(nested) ? nested : null;
}

function forEachContentItemFrameInOutline(rootList: ListNode, visit: ContentItemVisitor): void {
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
    if (!$isListItemNode(child) || isWrapperItem(child)) {
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

export function forEachContentItemInOutline(
  rootList: ListNode,
  visit: (item: ListItemNode) => TraverseResult
): void {
  forEachContentItemFrameInOutline(rootList, (item) => visit(item));
}

export function forEachContentItemWithAncestorsInOutline(
  rootList: ListNode,
  visit: (item: ListItemNode, ancestors: ListItemNode[]) => TraverseResult
): void {
  forEachContentItemFrameInOutline(rootList, visit);
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
