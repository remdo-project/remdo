import type { ListItemNode } from '@lexical/list';
import {
  $isListItemNode,
  $isListNode,
} from '@lexical/list';
import { reportInvariant } from '@/editor/invariant';
import { $getOrCreateChildList, getPreviousContentSibling, isChildrenWrapper } from '@/editor/outline/list-structure';

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

  const previousContent = getPreviousContentSibling(noteItem);
  if (!previousContent) {
    reportInvariant({
      message: 'Cannot indent: no previous content sibling',
      context: { noteKey: noteItem.getKey() },
    });
    return;
  }

  const targetList = $getOrCreateChildList(previousContent);
  targetList.append(...getNodesToMove(noteItem));
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
