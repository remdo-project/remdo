import type { ListItemNode, ListNode } from '@lexical/list';
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
} from '@lexical/list';
import { reportInvariant } from '@/editor/invariant';
import { isChildrenWrapper } from '@/editor/outline/list-structure';

function getPreviousContentItem(noteItem: ListItemNode): ListItemNode | null {
  let sibling = noteItem.getPreviousSibling();
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

export function $indentNote(noteItem: ListItemNode) {
  const parentList = noteItem.getParent();
  if (!$isListNode(parentList)) {
    reportInvariant({
      message: 'Cannot indent: parent is not a list',
      context: { noteKey: noteItem.getKey(), parentType: parentList?.getType ? parentList.getType() : undefined },
    });
    return;
  }

  const previousContent = getPreviousContentItem(noteItem);
  if (!previousContent) {
    reportInvariant({
      message: 'Cannot indent: no previous content sibling',
      context: { noteKey: noteItem.getKey() },
    });
    return;
  }

  const targetList = $getOrCreateChildList(previousContent, parentList);
  targetList.append(...getNodesToMove(noteItem));
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

export function $outdentNote(noteItem: ListItemNode) {
  const parentList = noteItem.getParent();
  if (!$isListNode(parentList)) {
    reportInvariant({
      message: 'Cannot outdent: parent is not a list',
      context: { noteKey: noteItem.getKey(), parentType: parentList?.getType ? parentList.getType() : undefined },
    });
    return;
  }

  const parentWrapper = parentList.getParent();
  if (!isChildrenWrapper(parentWrapper)) {
    reportInvariant({
      message: 'Cannot outdent: parent wrapper missing or malformed',
      context: { noteKey: noteItem.getKey(), parentType: parentWrapper?.getType ? parentWrapper.getType() : undefined },
    });
    return;
  }

  const grandParentList = parentWrapper.getParent();
  if (!$isListNode(grandParentList)) {
    reportInvariant({
      message: 'Cannot outdent: grandparent is not a list',
      context: {
        noteKey: noteItem.getKey(),
        grandParentType: grandParentList?.getType ? grandParentList.getType() : undefined,
      },
    });
    return;
  }

  const nodesToMove = getNodesToMove(noteItem);
  let referenceNode: ListItemNode = parentWrapper;

  for (const node of nodesToMove) {
    const inserted = referenceNode.insertAfter(node);
    if (!$isListItemNode(inserted)) {
      reportInvariant({
        message: 'Outdent expected a list item node',
        context: {
          noteKey: noteItem.getKey(),
          insertedType: inserted.getType(),
        },
      });
      return;
    }
    referenceNode = inserted;
  }

  const nestedList = parentWrapper.getFirstChild();
  if ($isListNode(nestedList) && nestedList.getChildrenSize() === 0) {
    parentWrapper.remove();
  }
}
