// TODO: add unit tests covering every helper in this module.
import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from '@lexical/list';
import type { LexicalNode } from 'lexical';

type ChildListItemNode = ListItemNode & { getFirstChild: () => ListNode };

export const isChildrenWrapper = (node: LexicalNode | null | undefined): node is ChildListItemNode =>
  $isListItemNode(node) && node.getChildren().length === 1 && $isListNode(node.getFirstChild());

export const findNearestListItem = (node: LexicalNode | null): ListItemNode | null => {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isListItemNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
};

export const getContentSiblings = (list: ListNode): ListItemNode[] => {
  const items: ListItemNode[] = [];
  for (const child of list.getChildren()) {
    if ($isListItemNode(child) && !isChildrenWrapper(child)) {
      items.push(child);
    }
  }
  return items;
};

export const getContentListItem = (item: ListItemNode): ListItemNode => {
  if (!isChildrenWrapper(item)) {
    return item;
  }

  const previous = item.getPreviousSibling();
  if ($isListItemNode(previous) && !isChildrenWrapper(previous)) {
    return previous;
  }

  return item;
};

export const getParentNote = (list: ListNode): ListItemNode | null => {
  const wrapper = list.getParent();
  if (!$isListItemNode(wrapper)) return null;
  const parentNote = wrapper.getPreviousSibling();
  return $isListItemNode(parentNote) && !isChildrenWrapper(parentNote) ? parentNote : null;
};

export const getNodesForNote = (note: ListItemNode): LexicalNode[] => {
  const nodes: LexicalNode[] = [note];
  const wrapper = note.getNextSibling();
  if (isChildrenWrapper(wrapper)) {
    nodes.push(wrapper);
  }
  return nodes;
};

export const flattenNoteNodes = (notes: ListItemNode[]): LexicalNode[] => notes.flatMap(getNodesForNote);

export const insertAfter = (reference: LexicalNode, nodes: LexicalNode[]) => {
  if (nodes.length === 0) return;
  let ref = reference;
  for (const node of nodes) {
    const inserted = ref.insertAfter(node);
    ref = inserted;
  }
};

export const insertBefore = (reference: LexicalNode, nodes: LexicalNode[]) => {
  if (nodes.length === 0) return;
  let ref = reference;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (!node) continue;
    const inserted = ref.insertBefore(node);
    ref = inserted;
  }
};

export const $getOrCreateChildList = (parentNote: ListItemNode): ListNode => {
  const parentList = parentNote.getParent();
  if (!$isListNode(parentList)) {
    throw new Error('Expected parent note to live inside a list');
  }

  const existingWrapper = parentNote.getNextSibling();
  if (isChildrenWrapper(existingWrapper)) {
    const childList = existingWrapper.getFirstChild();
    if ($isListNode(childList)) {
      return childList;
    }
    existingWrapper.remove();
  }

  const wrapper = $createListItemNode();
  const nested = $createListNode(parentList.getListType());
  wrapper.append(nested);
  parentNote.insertAfter(wrapper);
  return nested;
};

export const maybeRemoveEmptyWrapper = (list: ListNode) => {
  if (list.getChildrenSize() > 0) return;
  const wrapper = list.getParent();
  if ($isListItemNode(wrapper) && isChildrenWrapper(wrapper)) {
    wrapper.remove();
  }
};
