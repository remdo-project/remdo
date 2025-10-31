import type { ListItemNode, ListNode } from '@lexical/list';
import type { LexicalNode } from 'lexical';
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
} from '@lexical/list';

const isChildrenWrapper = (node: LexicalNode | null | undefined): node is ListItemNode =>
  $isListItemNode(node) &&
  node.getChildren().length === 1 &&
  $isListNode(node.getFirstChild());

function getPreviousContentItem(noteItem: ListItemNode): ListItemNode | null {
  let sibling: LexicalNode | null = noteItem.getPreviousSibling();
  while (sibling) {
    if ($isListItemNode(sibling) && !isChildrenWrapper(sibling)) {
      return sibling;
    }
    sibling = sibling.getPreviousSibling();
  }
  return null;
}

function getNodesToMove(noteItem: ListItemNode): ListItemNode[] {
  const childWrapper = noteItem.getNextSibling();
  return isChildrenWrapper(childWrapper) ? [noteItem, childWrapper] : [noteItem];
}

export function $indentNote(noteItem: ListItemNode): boolean {
  const parentList = noteItem.getParent();
  if (!$isListNode(parentList)) {
    return false;
  }

  const previousContent = getPreviousContentItem(noteItem);
  if (!previousContent) {
    return false;
  }

  const targetList = $getOrCreateChildList(previousContent, parentList);
  targetList.append(...getNodesToMove(noteItem));
  return true;
}

function $getOrCreateChildList(parentContentItem: ListItemNode, parentList: ListNode): ListNode {
  const existingWrapper = parentContentItem.getNextSibling();
  if (isChildrenWrapper(existingWrapper)) {
    const childList = existingWrapper.getFirstChild();
    if ($isListNode(childList)) {
      return childList;
    }
    existingWrapper.remove();
  }

  const wrapper = $createListItemNode();
  const nestedList = $createListNode(parentList.getListType());
  wrapper.append(nestedList);
  parentContentItem.insertAfter(wrapper);
  return nestedList;
}

export function $outdentNote(noteItem: ListItemNode): boolean {
  const parentList = noteItem.getParent();
  if (!$isListNode(parentList)) {
    return false;
  }

  const parentWrapper = parentList.getParent();
  if (!$isListItemNode(parentWrapper) || !isChildrenWrapper(parentWrapper)) {
    return false;
  }

  const grandParentList = parentWrapper.getParent();
  if (!$isListNode(grandParentList)) {
    return false;
  }

  const nodesToMove = getNodesToMove(noteItem);
  let referenceNode: ListItemNode = parentWrapper;

  for (const node of nodesToMove) {
    const inserted = referenceNode.insertAfter(node);
    if (!$isListItemNode(inserted)) {
      throw new Error('Outdent expected a list item node');
    }
    referenceNode = inserted;
  }

  const nestedList = parentWrapper.getFirstChild();
  if ($isListNode(nestedList) && nestedList.getChildrenSize() === 0) {
    parentWrapper.remove();
  }

  return true;
}
