import type {ListItemNode, ListNode} from '@lexical/list';
import type {LexicalEditor, NodeKey} from 'lexical';
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
} from '@lexical/list';
import {$getNodeByKey} from 'lexical';

function isNestedListContainer(
  node: ListItemNode | null | undefined,
): node is ListItemNode {
  if (!$isListItemNode(node)) {
    return false;
  }
  const firstChild = node.getFirstChild();
  return $isListNode(firstChild);
}

function normalizeOrderedListValues(list: ListNode): void {
  if (list.getListType() !== 'number') {
    return;
  }

  let nextValue = list.getStart();
  let child: ListItemNode | null = list.getFirstChild<ListItemNode>();
  while (child !== null) {
    if (child.getValue() !== nextValue) {
      child.setValue(nextValue);
    }
    const firstChild = child.getFirstChild();
    if (!$isListNode(firstChild)) {
      nextValue++;
    }
    child = child.getNextSibling<ListItemNode>();
  }
}

function getAssociatedNestedContainer(
  listItem: ListItemNode,
): ListItemNode | null {
  const nextSibling = listItem.getNextSibling<ListItemNode>();
  return isNestedListContainer(nextSibling) ? nextSibling : null;
}

function getPreviousNote(listItem: ListItemNode): ListItemNode | null {
  let previous = listItem.getPreviousSibling<ListItemNode>();
  while (previous !== null && isNestedListContainer(previous)) {
    previous = previous.getPreviousSibling<ListItemNode>();
  }
  return previous ?? null;
}

function getNextNote(listItem: ListItemNode): ListItemNode | null {
  let next = listItem.getNextSibling<ListItemNode>();

  // Skip the container that belongs to this note (if present).
  if (next !== null && isNestedListContainer(next)) {
    next = next.getNextSibling<ListItemNode>();
  }

  while (next !== null && isNestedListContainer(next)) {
    next = next.getNextSibling<ListItemNode>();
  }

  return next ?? null;
}

function ensureNestedContainer(
  listItem: ListItemNode,
  parentList: ListNode,
): {container: ListItemNode; list: ListNode} {
  const existing = getAssociatedNestedContainer(listItem);

  if (existing !== null) {
    const existingList = existing.getFirstChild();
    if ($isListNode(existingList)) {
      return {container: existing, list: existingList};
    }
  }

  const nestedList = $createListNode(parentList.getListType());
  nestedList
    .setFormat(parentList.getFormatType())
    .setStyle(parentList.getStyle())
    .setTextFormat(parentList.getTextFormat())
    .setTextStyle(parentList.getTextStyle());
  const direction = parentList.getDirection();
  if (direction !== null) {
    nestedList.setDirection(direction);
  }

  const container = $createListItemNode();
  container.append(nestedList);
  listItem.insertAfter(container);

  return {container, list: nestedList};
}

export function $indentNote(listItem: ListItemNode): void {
  const parentList = listItem.getParent<ListNode>();
  if (!$isListNode(parentList)) {
    return;
  }

  const previousNote = getPreviousNote(listItem);
  if (previousNote === null) {
    return;
  }

  const {list: nestedList} = ensureNestedContainer(previousNote, parentList);

  const childContainer = getAssociatedNestedContainer(listItem);

  nestedList.append(listItem);
  if (childContainer !== null) {
    nestedList.append(childContainer);
  }

  normalizeOrderedListValues(parentList);
  normalizeOrderedListValues(nestedList);
}

export function $indentNoteByKey(key: NodeKey): void {
  const node = $getNodeByKey<ListItemNode>(key);
  if ($isListItemNode(node)) {
    $indentNote(node);
  }
}

export function $reorderNote(
  listItem: ListItemNode,
  dir: 'up' | 'down',
): void {
  const parentList = listItem.getParent<ListNode>();
  if (!$isListNode(parentList)) {
    return;
  }

  const childContainer = getAssociatedNestedContainer(listItem);

  if (dir === 'up') {
    const previousNote = getPreviousNote(listItem);
    if (previousNote === null) {
      return;
    }

    previousNote.insertBefore(listItem, false);
    if (childContainer !== null) {
      listItem.insertAfter(childContainer, false);
    }
  } else {
    const nextNote = getNextNote(listItem);
    if (nextNote === null) {
      return;
    }

    const nextTail = getAssociatedNestedContainer(nextNote) ?? nextNote;
    nextTail.insertAfter(listItem, false);
    if (childContainer !== null) {
      listItem.insertAfter(childContainer, false);
    }
  }

  normalizeOrderedListValues(parentList);
}

export function $reorderNoteByKey(key: NodeKey, dir: 'up' | 'down'): void {
  const node = $getNodeByKey<ListItemNode>(key);
  if ($isListItemNode(node)) {
    $reorderNote(node, dir);
  }
}

export function indentNote(editor: LexicalEditor, key: NodeKey): void {
  editor.update(() => {
    $indentNoteByKey(key);
  });
}

export function reorderNote(
  editor: LexicalEditor,
  key: NodeKey,
  dir: 'up' | 'down',
): void {
  editor.update(() => {
    $reorderNoteByKey(key, dir);
  });
}
