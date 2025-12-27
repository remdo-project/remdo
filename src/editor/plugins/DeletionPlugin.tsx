//TODO review, refactor, simplify, extract common helpers
import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical';
import type { LexicalNode, TextNode } from 'lexical';
import { useEffect, useState } from 'react';
import { findNearestListItem, getContentListItem, isChildrenWrapper, maybeRemoveEmptyWrapper } from '@/editor/outline/list-structure';
import { getContiguousSelectionHeads } from '@/editor/outline/selection/heads';
import { getFirstDescendantListItem, removeNoteSubtree, sortHeadsByDocumentOrder } from '@/editor/outline/selection/tree';

function getNestedList(item: ListItemNode): ListNode | null {
  const next = item.getNextSibling();
  if (isChildrenWrapper(next)) {
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
  while (isChildrenWrapper(current)) {
    current = current.getPreviousSibling();
  }
  return $isListItemNode(current) ? current : null;
}

function getNextContentSibling(item: ListItemNode): ListItemNode | null {
  let current = item.getNextSibling();
  while (isChildrenWrapper(current)) {
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

function getFirstChildContentItem(item: ListItemNode): ListItemNode | null {
  const nested = getNestedList(item);
  if (!nested) {
    return null;
  }

  for (const child of nested.getChildren()) {
    if ($isListItemNode(child) && !isChildrenWrapper(child)) {
      return child;
    }
  }

  return null;
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

function isDescendantOf(node: LexicalNode, ancestor: LexicalNode): boolean {
  let current: LexicalNode | null = node;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.getParent();
  }
  return false;
}

function isCollapsedSelectionAtEdge(
  selection: ReturnType<typeof $getSelection>,
  edge: 'start' | 'end',
  contentItem: ListItemNode
): boolean {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const anchorNode = selection.anchor.getNode();
  if ($isTextNode(anchorNode)) {
    const offset = selection.anchor.offset;
    const size = anchorNode.getTextContentSize();
    return edge === 'start' ? offset === 0 : offset === size;
  }

  return contentItem.getTextContent().length === 0;
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

function findBoundaryTextNode(node: LexicalNode, edge: 'start' | 'end'): TextNode | null {
  if ($isTextNode(node)) {
    return node;
  }

  const canTraverse = typeof (node as any).getChildren === 'function';
  if (!canTraverse) {
    return null;
  }

  const children = (node as any).getChildren?.() ?? [];
  const ordered = edge === 'start' ? children : children.toReversed();

  for (const child of ordered) {
    if ($isListNode(child)) {
      continue;
    }

    const match = findBoundaryTextNode(child, edge);
    if (match) {
      return match;
    }
  }

  return null;
}

function resolveBoundaryPoint(listItem: ListItemNode, edge: 'start' | 'end') {
  const textNode = findBoundaryTextNode(listItem, edge);
  if (!textNode) {
    return null;
  }

  const length = textNode.getTextContentSize();
  const offset = edge === 'start' ? 0 : length;
  return { node: textNode, offset } as const;
}

function $selectItemEdge(item: ListItemNode, edge: 'start' | 'end'): boolean {
  const contentItem = getContentListItem(item);
  const selectable = contentItem as ListItemNode & { selectStart?: () => void; selectEnd?: () => void };
  const selectEdge = edge === 'start' ? selectable.selectStart : selectable.selectEnd;

  if (typeof selectEdge === 'function') {
    selectEdge.call(selectable);
    return true;
  }

  const boundary = resolveBoundaryPoint(contentItem, edge);
  if (!boundary) {
    return false;
  }

  const range = $createRangeSelection();
  range.setTextNodeRange(boundary.node, boundary.offset, boundary.node, boundary.offset);
  $setSelection(range);
  return true;
}

function $setItemText(item: ListItemNode, text: string): TextNode {
  item.clear();
  const node = $createTextNode(text);
  item.append(node);
  return node;
}

function $removeNote(contentItem: ListItemNode) {
  const wrapper = contentItem.getNextSibling();
  if (isChildrenWrapper(wrapper)) {
    wrapper.remove();
  }

  const parentList = contentItem.getParent();
  const parentWrapper = $isListNode(parentList) ? parentList.getParent() : null;
  contentItem.remove();

  if ($isListNode(parentList)) {
    maybeRemoveEmptyWrapper(parentList);
    if ($isListItemNode(parentWrapper) && parentWrapper.getChildrenSize() === 0) {
      parentWrapper.remove();
    }
  }
}

function isEmptyNote(item: ListItemNode): boolean {
  return item.getTextContent().trim().length === 0;
}

function getNextNoteInDocumentOrder(item: ListItemNode): ListItemNode | null {
  const firstChild = getFirstChildContentItem(item);
  if (firstChild) {
    return firstChild;
  }

  let current: ListItemNode | null = item;
  while (current) {
    const nextSibling = getNextContentSibling(current);
    if (nextSibling) {
      return nextSibling;
    }

    const parent: LexicalNode | null = current.getParent();
    const parentList: ListNode | null = $isListNode(parent) ? parent : null;
    const parentNote: ListItemNode | null = parentList ? getParentNote(parentList) : null;
    current = parentNote;
  }

  return null;
}

function getPreviousNoteInDocumentOrder(item: ListItemNode): ListItemNode | null {
  const previousSibling = getPreviousContentSibling(item);
  if (previousSibling) {
    return getSubtreeTail(previousSibling);
  }

  const parent = item.getParent();
  const parentList = $isListNode(parent) ? parent : null;
  return parentList ? getParentNote(parentList) : null;
}

interface CaretPlan {
  target: ListItemNode;
  edge: 'start' | 'end';
}

function resolveCaretPlanAfterRemoval(item: ListItemNode): CaretPlan | null {
  const nextSibling = getNextContentSibling(item);
  if (nextSibling) {
    return { target: nextSibling, edge: 'start' };
  }

  const previousSibling = getPreviousContentSibling(item);
  if (previousSibling) {
    return { target: getSubtreeTail(previousSibling), edge: 'end' };
  }

  const parentList = item.getParent();
  const parentNote = $isListNode(parentList) ? getParentNote(parentList) : null;
  if (parentNote) {
    return { target: parentNote, edge: 'end' };
  }

  return null;
}

function resolveCaretPlanAfterStructuralDeletion(heads: ListItemNode[]): CaretPlan | null {
  if (heads.length === 0) {
    return null;
  }

  const orderedHeads = sortHeadsByDocumentOrder(heads);
  const lastHead = orderedHeads.at(-1)!;
  const nextSibling = getNextContentSibling(lastHead);
  if (nextSibling) {
    return { target: nextSibling, edge: 'start' };
  }

  const firstHead = orderedHeads[0]!;
  const previousSibling = getPreviousContentSibling(firstHead);
  if (previousSibling) {
    return { target: getSubtreeTail(previousSibling), edge: 'end' };
  }

  const parentList = firstHead.getParent();
  const parentNote = $isListNode(parentList) ? getParentNote(parentList) : null;
  if (parentNote) {
    return { target: parentNote, edge: 'end' };
  }

  return null;
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
        const candidate = findNearestListItem(anchorNode);
        if (!candidate) {
          return false;
        }

        const contentItem = getContentListItem(candidate);
        if (!isDescendantOf(anchorNode, contentItem)) {
          return false;
        }

        if (!isCollapsedSelectionAtEdge(selection, 'start', contentItem)) {
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
    const $deleteStructuralSelection = (event: KeyboardEvent | null): boolean => {
      if (!editor.selection.isStructural()) {
        return false;
      }

      const outlineSelection = editor.selection.get();
      const structuralKeys = outlineSelection?.headKeys ?? [];
      if (structuralKeys.length === 0) {
        return false;
      }

      const selection = $getSelection();
      const attachedHeads = structuralKeys
        .map((key) => $getNodeByKey<ListItemNode>(key))
        .filter((node): node is ListItemNode => $isListItemNode(node) && node.isAttached());

      let heads = attachedHeads;
      if (heads.length === 0 && $isRangeSelection(selection)) {
        heads = getContiguousSelectionHeads(selection);
      }

      if (heads.length === 0) {
        return false;
      }

      event?.preventDefault();
      event?.stopPropagation();

      const caretPlan = resolveCaretPlanAfterStructuralDeletion(heads);
      const orderedHeads = sortHeadsByDocumentOrder(heads);

      for (const head of orderedHeads.toReversed()) {
        removeNoteSubtree(head);
      }

      let caretApplied = false;
      if (caretPlan) {
        caretApplied = $selectItemEdge(caretPlan.target, caretPlan.edge);
      }

      if (!caretApplied) {
        const root = $getRoot();
        let list = root.getFirstChild();
        if (!$isListNode(list)) {
          const newList = $createListNode('bullet');
          root.append(newList);
          list = newList;
        }

        if ($isListNode(list)) {
          const firstItem = getFirstDescendantListItem(list);
          let targetItem: ListItemNode;

          if (firstItem) {
            targetItem = getContentListItem(firstItem);
          } else {
            const listItem = $createListItemNode();
            listItem.append($createParagraphNode());
            list.append(listItem);
            targetItem = listItem;
          }

          caretApplied = $selectItemEdge(targetItem, 'start');
        }
      }

      if (!caretApplied && $isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        if ($isTextNode(anchorNode)) {
          selection.setTextNodeRange(anchorNode, selection.anchor.offset, anchorNode, selection.anchor.offset);
        } else {
          const anchorItem = findNearestListItem(anchorNode);
          if (anchorItem) {
            $selectItemEdge(anchorItem, 'start');
          }
        }
      }

      return true;
    };

    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event: KeyboardEvent | null) => {
        if ($deleteStructuralSelection(event)) {
          return true;
        }

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        const candidate = findNearestListItem(anchorNode);
        if (!candidate) {
          return false;
        }

        const contentItem = getContentListItem(candidate);
        if (!isDescendantOf(anchorNode, contentItem)) {
          return false;
        }

        if (!isCollapsedSelectionAtEdge(selection, 'start', contentItem)) {
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
          $removeNote(contentItem);
          $selectItemEdge(target, 'end');
          return true;
        }

        $removeNote(contentItem);

        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      (event: KeyboardEvent | null) => {
        if ($deleteStructuralSelection(event)) {
          return true;
        }

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        const candidate = findNearestListItem(anchorNode);
        if (!candidate) {
          return false;
        }

        const contentItem = getContentListItem(candidate);
        if (!isDescendantOf(anchorNode, contentItem)) {
          return false;
        }

        if (!isCollapsedSelectionAtEdge(selection, 'end', contentItem)) {
          return false;
        }

        event?.preventDefault();
        event?.stopPropagation();

        const currentHasChildren = noteHasChildren(contentItem);
        const currentIsEmptyLeaf = !currentHasChildren && isEmptyNote(contentItem);

        if (currentIsEmptyLeaf) {
          const previousNote = getPreviousNoteInDocumentOrder(contentItem);
          const nextNote = getNextNoteInDocumentOrder(contentItem);
          if (!previousNote && !nextNote) {
            $selectItemEdge(contentItem, 'end');
            return true;
          }

          const caretPlan = resolveCaretPlanAfterRemoval(contentItem);
          $removeNote(contentItem);
          if (caretPlan) {
            $selectItemEdge(caretPlan.target, caretPlan.edge);
          }
          return true;
        }

        const nextNote = getNextNoteInDocumentOrder(contentItem);
        if (!nextNote) {
          return true;
        }

        if (noteHasChildren(nextNote)) {
          return true;
        }

        const leftText = contentItem.getTextContent();
        const rightText = nextNote.getTextContent();
        const { merged, joinOffset } = computeMergeText(leftText, rightText);
        const textNode = $setItemText(contentItem, merged);
        textNode.select(joinOffset, joinOffset);

        $removeNote(nextNote);

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
