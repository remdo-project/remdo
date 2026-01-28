// TODO: add unit tests covering every helper in this module.
import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from '@lexical/list';
import { reportInvariant } from '@/editor/invariant';
import type { LexicalNode } from 'lexical';

type ChildListItemNode = ListItemNode & { getFirstChild: () => ListNode };

// Treat wrapper nodes strictly: a wrapper must contain exactly one list child and nothing else.
// Lexical's isNestedListNode only checks that the first child is a list, but we avoid that looseness
// because destructive operations (remove/move/merge) could drop extra content if we misclassify.
export const isChildrenWrapper = (node: LexicalNode | null | undefined): node is ChildListItemNode => {
  if (!$isListItemNode(node)) {
    return false;
  }

  const children = node.getChildren();
  if (!$isListNode(children[0] ?? null)) {
    return false;
  }

  if (children.length !== 1) {
    reportInvariant({
      message: 'List item wrapper has unexpected children',
      context: { key: node.getKey(), childTypes: children.map((child) => child.getType()) },
    });
    return false;
  }

  return true;
};

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

export const getPreviousContentSibling = (item: ListItemNode): ListItemNode | null => {
  let sibling = item.getPreviousSibling();
  while (sibling) {
    if ($isListItemNode(sibling) && !isChildrenWrapper(sibling)) {
      return sibling;
    }
    sibling = sibling.getPreviousSibling();
  }
  return null;
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
  if (!$isListItemNode(wrapper)) {
    reportInvariant({
      message: 'List parent is not a list item wrapper',
      context: { wrapperType: wrapper?.getType ? wrapper.getType() : undefined },
    });
    return null;
  }
  const parentNote = wrapper.getPreviousSibling();
  if ($isListItemNode(parentNote) && !isChildrenWrapper(parentNote)) {
    return parentNote;
  }
  reportInvariant({
    message: 'Parent note could not be resolved from wrapper sibling',
    context: { wrapperKey: wrapper.getKey(), parentType: parentNote?.getType ? parentNote.getType() : undefined },
  });
  return null;
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
  if (isChildrenWrapper(wrapper)) {
    wrapper.remove();
    return;
  }

  if ($isListItemNode(wrapper) && wrapper.getChildrenSize() === 0) {
    wrapper.remove();
  }
};
