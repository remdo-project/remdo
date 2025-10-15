import type { ListItemNode, ListNode } from '@lexical/list';
import type { LexicalNode, NodeKey } from 'lexical';
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
} from '@lexical/list';
import { $getNodeByKey } from 'lexical';

function isChildrenWrapper(node: LexicalNode | null | undefined): node is ListItemNode {
  if (!$isListItemNode(node)) {
    return false;
  }
  const children = node.getChildren();
  return (
    children.length === 1 &&
    $isListNode(children[0])
  );
}

function ensureChildList(
  parentContentItem: ListItemNode,
  parentList: ListNode
): ListNode | null {
  const existingWrapper = parentContentItem.getNextSibling();
  if (isChildrenWrapper(existingWrapper)) {
    const nested = existingWrapper.getFirstChild();
    return $isListNode(nested) ? nested : null;
  }

  const wrapper = $createListItemNode();
  const nestedList = $createListNode(parentList.getListType());
  wrapper.append(nestedList);
  parentContentItem.insertAfter(wrapper);
  return nestedList;
}

export function $indentNote(key: NodeKey): boolean {
  const noteItem = $getNodeByKey(key);
  if (!$isListItemNode(noteItem)) {
    return false;
  }

  const parentList = noteItem.getParent();
  if (!$isListNode(parentList)) {
    return false;
  }

  const siblings = parentList.getChildren();
  const index = siblings.findIndex((child) => child.is(noteItem));
  if (index <= 0) {
    return false;
  }

  let previousContent: ListItemNode | null = null;
  for (let i = index - 1; i >= 0; i--) {
    const candidate = siblings[i];
    if (!$isListItemNode(candidate)) {
      continue;
    }
    if (isChildrenWrapper(candidate)) {
      continue;
    }
    previousContent = candidate;
    break;
  }

  if (!previousContent) {
    return false;
  }

  const targetList = ensureChildList(previousContent, parentList);
  if (!targetList) {
    return false;
  }

  const maybeChildWrapper = noteItem.getNextSibling();
  const nodesToMove: ListItemNode[] = [noteItem];
  if (isChildrenWrapper(maybeChildWrapper)) {
    nodesToMove.push(maybeChildWrapper);
  }

  for (const node of nodesToMove) {
    targetList.append(node);
  }

  return true;
}
