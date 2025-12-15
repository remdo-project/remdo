//TODO review, refactor, simplify, extract common helpers
import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createTextNode, $getSelection, $isRangeSelection, $isTextNode, COMMAND_PRIORITY_CRITICAL, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND } from 'lexical';
import type { TextNode } from 'lexical';
import { useEffect, useState } from 'react';
import { findNearestListItem, getContentListItem, isChildrenWrapper, maybeRemoveEmptyWrapper } from '@/editor/outline/list-structure';

function getNestedList(item: ListItemNode): ListNode | null {
  const next = item.getNextSibling();
  if ($isListItemNode(next) && isChildrenWrapper(next)) {
    const nested = next.getFirstChild();
    if ($isListNode(nested)) {
      return nested;
    }
  }

  for (const child of item.getChildren()) {
    if ($isListNode(child)) {
      return child;
    }
  }

  return null;
}

function getParentNote(list: ListNode): ListItemNode | null {
  const wrapper = list.getParent();
  if (!$isListItemNode(wrapper)) {
    return null;
  }

  const parent = wrapper.getPreviousSibling();
  if ($isListItemNode(parent) && !isChildrenWrapper(parent)) {
    return parent;
  }

  return null;
}

function noteHasChildren(item: ListItemNode): boolean {
  const nested = getNestedList(item);
  return Boolean(nested && nested.getChildrenSize() > 0);
}

function getPreviousContentSibling(item: ListItemNode): ListItemNode | null {
  let current = item.getPreviousSibling();
  while ($isListItemNode(current) && isChildrenWrapper(current)) {
    current = current.getPreviousSibling();
  }
  return $isListItemNode(current) ? current : null;
}

function getNextContentSibling(item: ListItemNode): ListItemNode | null {
  let current = item.getNextSibling();
  while ($isListItemNode(current) && isChildrenWrapper(current)) {
    current = current.getNextSibling();
  }
  return $isListItemNode(current) ? current : null;
}

function getSubtreeTail(item: ListItemNode): ListItemNode {
  const nested = getNestedList(item);
  if (!nested) {
    return item;
  }
  return getLastDescendantListItem(nested) ?? item;
}

function getLastDescendantListItem(node: ListNode): ListItemNode | null {
  const children = node.getChildren();
  for (let i = children.length - 1; i >= 0; i -= 1) {
    const child = children[i];
    if (!$isListItemNode(child)) {
      continue;
    }

    if (isChildrenWrapper(child)) {
      const nested = child.getFirstChild();
      if ($isListNode(nested) && nested.getChildrenSize() > 0) {
        return getLastDescendantListItem(nested);
      }
      continue;
    }

    const nested = getNestedList(child);
    if (nested && nested.getChildrenSize() > 0) {
      return getLastDescendantListItem(nested) ?? getContentListItem(child);
    }

    return getContentListItem(child);
  }

  return null;
}

function computeMergeText(left: string, right: string): { merged: string; joinOffset: number } {
  const needsSpace =
    left.length > 0 &&
    !/\s$/.test(left) &&
    right.length > 0 &&
    !/^\s/.test(right);

  const joinOffset = left.length + (needsSpace ? 1 : 0);
  return { merged: `${left}${needsSpace ? ' ' : ''}${right}`, joinOffset };
}

function $setItemText(item: ListItemNode, text: string): TextNode {
  item.clear();
  const node = $createTextNode(text);
  item.append(node);
  return node;
}

function $removeNote(contentItem: ListItemNode) {
  const wrapper = contentItem.getNextSibling();
  if ($isListItemNode(wrapper) && isChildrenWrapper(wrapper)) {
    wrapper.remove();
  }

  const parentList = contentItem.getParent();
  contentItem.remove();

  if ($isListNode(parentList)) {
    maybeRemoveEmptyWrapper(parentList);
  }
}

export function DeletionPlugin() {
  const [editor] = useLexicalComposerContext();
  const [rootElement, setRootElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    return editor.registerRootListener((nextRootElement) => {
      setRootElement(nextRootElement);
    });
  }, [editor]);

  useEffect(() => {
    if (!rootElement) {
      return;
    }

    const handleNoopBackspaceCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace') {
        return;
      }

      if (event.altKey || event.metaKey || event.ctrlKey) {
        return;
      }

      const shouldBlock = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        if (!$isTextNode(anchorNode)) {
          return false;
        }

        if (selection.anchor.offset !== 0 || selection.focus.offset !== 0) {
          return false;
        }

        const candidate = findNearestListItem(anchorNode);
        if (!candidate) {
          return false;
        }

        const contentItem = getContentListItem(candidate);
        if (anchorNode.getParent() !== contentItem) {
          return false;
        }

        if (noteHasChildren(contentItem)) {
          return true;
        }

        const previousSibling = getPreviousContentSibling(contentItem);
        if (previousSibling) {
          return false;
        }

        const parentList = contentItem.getParent();
        const parentNote = $isListNode(parentList) ? getParentNote(parentList) : null;
        return parentNote === null;
      });

      if (!shouldBlock) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    };

    rootElement.addEventListener('keydown', handleNoopBackspaceCapture, true);
    return () => {
      rootElement.removeEventListener('keydown', handleNoopBackspaceCapture, true);
    };
  }, [editor, rootElement]);

  useEffect(() => {
    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event: KeyboardEvent | null) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        if (!$isTextNode(anchorNode)) {
          return false;
        }

        if (selection.anchor.offset !== 0 || selection.focus.offset !== 0) {
          return false;
        }

        const candidate = findNearestListItem(anchorNode);
        if (!candidate) {
          return false;
        }

        const contentItem = getContentListItem(candidate);
        if (anchorNode.getParent() !== contentItem) {
          return false;
        }

        const currentHasChildren = noteHasChildren(contentItem);
        if (currentHasChildren) {
          event?.preventDefault();
          event?.stopPropagation();
          return true;
        }

        const previousSibling = getPreviousContentSibling(contentItem);
        const parentList = contentItem.getParent();
        const parentNote = $isListNode(parentList) ? getParentNote(parentList) : null;

        if (!previousSibling && !parentNote) {
          event?.preventDefault();
          event?.stopPropagation();
          return true;
        }

        event?.preventDefault();
        event?.stopPropagation();

        const currentText = contentItem.getTextContent();

        const target = previousSibling ? getSubtreeTail(previousSibling) : parentNote;
        if (!target) {
          return true;
        }

        if (currentText.length > 0) {
          const leftText = target.getTextContent();
          const { merged, joinOffset } = computeMergeText(leftText, currentText);
          const textNode = $setItemText(target, merged);
          textNode.select(joinOffset, joinOffset);
        } else {
          const leftText = target.getTextContent();
          const textNode = $setItemText(target, leftText);
          textNode.select(leftText.length, leftText.length);
        }

        $removeNote(contentItem);

        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      (event: KeyboardEvent | null) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        if (!$isTextNode(anchorNode)) {
          return false;
        }

        if (selection.anchor.offset !== anchorNode.getTextContentSize()) {
          return false;
        }

        const candidate = findNearestListItem(anchorNode);
        if (!candidate) {
          return false;
        }

        const contentItem = getContentListItem(candidate);
        if (anchorNode.getParent() !== contentItem) {
          return false;
        }

        const nextSibling = getNextContentSibling(contentItem);
        if (!nextSibling) {
          return false;
        }

        const currentHasChildren = noteHasChildren(contentItem);
        const nextHasChildren = noteHasChildren(nextSibling);

        if (currentHasChildren || nextHasChildren) {
          event?.preventDefault();
          event?.stopPropagation();
          return true;
        }

        event?.preventDefault();
        event?.stopPropagation();

        const leftText = contentItem.getTextContent();
        const rightText = nextSibling.getTextContent();
        const { merged, joinOffset } = computeMergeText(leftText, rightText);
        const textNode = $setItemText(contentItem, merged);
        textNode.select(joinOffset, joinOffset);

        $removeNote(nextSibling);

        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    return () => {
      unregisterBackspace();
      unregisterDelete();
    };
  }, [editor]);

  return null;
}

export default DeletionPlugin;
