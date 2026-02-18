//TODO review, refactor, simplify, extract common helpers
import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode, $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical';
import type { LexicalNode, TextNode } from 'lexical';
import { useEffect, useState } from 'react';
import {
  flattenNoteNodes,
  getContentSiblings,
  getPreviousContentSibling,
  isChildrenWrapper,
  insertBefore,
  $getOrCreateChildList,
} from '@/editor/outline/list-structure';
import { $requireRootContentList, $resolveRootContentList, resolveContentItemFromNode } from '@/editor/outline/schema';
import { $normalizeOutlineRoot } from '@/editor/outline/normalization';
import { $resolveZoomBoundaryRoot, isWithinZoomBoundary } from '@/editor/outline/selection/boundary';
import { $selectItemEdge } from '@/editor/outline/selection/caret';
import { getContiguousSelectionHeads } from '@/editor/outline/selection/heads';
import {
  getFirstDescendantListItem,
  getNestedList,
  getNextContentSibling,
  noteHasChildren,
  getParentContentItem,
  getSubtreeTail,
  removeNoteSubtree,
  sortHeadsByDocumentOrder,
  isContentDescendantOf,
} from '@/editor/outline/selection/tree';

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

function getFirstChildContentItem(item: ListItemNode): ListItemNode | null {
  const nested = getNestedList(item);
  if (!nested) {
    return null;
  }

  return getFirstDescendantListItem(nested);
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

interface EdgeSelectionResult {
  selection: ReturnType<typeof $getSelection>;
  contentItem: ListItemNode;
}

function $resolveCollapsedSelectionAtEdge(edge: 'start' | 'end'): EdgeSelectionResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchorNode = selection.anchor.getNode();
  const contentItem = resolveContentItemFromNode(anchorNode);
  if (!contentItem) {
    return null;
  }

  if (!isDescendantOf(anchorNode, contentItem)) {
    return null;
  }

  if (!isCollapsedSelectionAtEdge(selection, edge, contentItem)) {
    return null;
  }

  return { selection, contentItem };
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

function isEmptyNote(item: ListItemNode): boolean {
  return item.getTextContent().trim().length === 0;
}

function getChildContentItems(item: ListItemNode): ListItemNode[] {
  const nested = getNestedList(item);
  if (!nested) {
    return [];
  }

  return getContentSiblings(nested);
}

function $moveChildrenToTarget(
  current: ListItemNode,
  target: ListItemNode,
  mode: 'append' | 'replace'
): boolean {
  const children = getChildContentItems(current);
  if (children.length === 0) {
    return false;
  }

  const nodesToMove = flattenNoteNodes(children);
  if (mode === 'replace') {
    insertBefore(current, nodesToMove);
    return true;
  }

  const targetList = $getOrCreateChildList(target);
  targetList.append(...nodesToMove);
  return true;
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

function resolveCaretPlanAfterStructuralDeletion(
  heads: ListItemNode[],
  boundaryRoot: ListItemNode | null
): CaretPlan | null {
  if (heads.length === 0) {
    return null;
  }

  const orderedHeads = sortHeadsByDocumentOrder(heads);
  const lastHead = orderedHeads.at(-1)!;
  const nextSibling = getNextContentSibling(lastHead);
  if (nextSibling && isWithinZoomBoundary(nextSibling, boundaryRoot)) {
    return { target: nextSibling, edge: 'start' };
  }

  const firstHead = orderedHeads[0]!;
  const previousSibling = getPreviousContentSibling(firstHead);
  if (previousSibling && isWithinZoomBoundary(previousSibling, boundaryRoot)) {
    return { target: getSubtreeTail(previousSibling), edge: 'end' };
  }

  const parentList = firstHead.getParent();
  const parentNote = $isListNode(parentList) ? getParentNote(parentList) : null;
  if (parentNote && isWithinZoomBoundary(parentNote, boundaryRoot)) {
    return { target: parentNote, edge: 'end' };
  }

  return null;
}

function $resolveStructuralHeadsFromKeys(keys: string[]): ListItemNode[] {
  return keys
    .map((key) => $getNodeByKey<ListItemNode>(key))
    .filter((node): node is ListItemNode => $isListItemNode(node) && node.isAttached());
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
        const edgeSelection = $resolveCollapsedSelectionAtEdge('start');
        if (!edgeSelection) {
          return false;
        }
        const { contentItem } = edgeSelection;

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
      let heads = $resolveStructuralHeadsFromKeys(structuralKeys);
      if (heads.length === 0 && $isRangeSelection(selection)) {
        heads = getContiguousSelectionHeads(selection);
      }

      if (heads.length === 0) {
        return false;
      }

      event?.preventDefault();
      event?.stopPropagation();

      const boundaryRoot = $resolveZoomBoundaryRoot(editor);
      const caretPlan = resolveCaretPlanAfterStructuralDeletion(heads, boundaryRoot);
      const orderedHeads = sortHeadsByDocumentOrder(heads);

      for (const head of orderedHeads.toReversed()) {
        removeNoteSubtree(head);
      }

      let caretApplied = false;
      if (caretPlan) {
        caretApplied = $selectItemEdge(caretPlan.target, caretPlan.edge);
      }

      if (!caretApplied && boundaryRoot && boundaryRoot.isAttached()) {
        caretApplied = $selectItemEdge(boundaryRoot, 'start');
      }

      if (!caretApplied) {
        let rootList = $resolveRootContentList();
        if (!rootList) {
          $normalizeOutlineRoot($getRoot());
          rootList = $requireRootContentList();
        }

        const firstItem = getFirstDescendantListItem(rootList);
        let targetItem: ListItemNode;

        if (firstItem) {
          targetItem = firstItem;
        } else {
          const listItem = $createListItemNode();
          listItem.append($createParagraphNode());
          rootList.append(listItem);
          targetItem = listItem;
        }

        caretApplied = $selectItemEdge(targetItem, 'start');
      }

      if (!caretApplied && $isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        if ($isTextNode(anchorNode)) {
          selection.setTextNodeRange(anchorNode, selection.anchor.offset, anchorNode, selection.anchor.offset);
        } else {
          const contentItem = resolveContentItemFromNode(anchorNode);
          if (contentItem) {
            $selectItemEdge(contentItem, 'start');
          }
        }
      }

      return true;
    };

    const $mergeAtStartOfNote = (selection: ReturnType<typeof $getSelection>, current: ListItemNode): boolean => {
      const target = getPreviousNoteInDocumentOrder(current);
      if (!target) {
        return true;
      }

      const currentHasChildren = noteHasChildren(current);
      const targetHasChildren = noteHasChildren(target);
      const currentIsEmptyLeaf = !currentHasChildren && isEmptyNote(current);
      const targetIsEmptyLeaf = !targetHasChildren && isEmptyNote(target);

      if (targetIsEmptyLeaf) {
        removeNoteSubtree(target);
        $selectItemEdge(current, 'start');
        return true;
      }

      if (currentIsEmptyLeaf) {
        removeNoteSubtree(current);
        $selectItemEdge(target, 'end');
        return true;
      }

      const leftText = target.getTextContent();
      const rightText = current.getTextContent();
      const { merged, joinOffset } = computeMergeText(leftText, rightText);
      const textNode = $setItemText(target, merged);
      textNode.select(joinOffset, joinOffset);

      if (currentHasChildren) {
        const targetIsParent = getParentContentItem(current) === target;
        $moveChildrenToTarget(current, target, targetIsParent ? 'replace' : 'append');
      }

      removeNoteSubtree(current);
      if ($isRangeSelection(selection)) {
        selection.dirty = true;
      }
      return true;
    };

    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event: KeyboardEvent | null) => {
        if ($deleteStructuralSelection(event)) {
          return true;
        }

        const edgeSelection = $resolveCollapsedSelectionAtEdge('start');
        if (!edgeSelection) {
          return false;
        }
        const { selection, contentItem } = edgeSelection;

        event?.preventDefault();
        event?.stopPropagation();
        const boundaryRoot = $resolveZoomBoundaryRoot(editor);
        if (boundaryRoot && contentItem.getKey() === boundaryRoot.getKey()) {
          return true;
        }

        return $mergeAtStartOfNote(selection, contentItem);
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      (event: KeyboardEvent | null) => {
        if ($deleteStructuralSelection(event)) {
          return true;
        }

        const edgeSelection = $resolveCollapsedSelectionAtEdge('end');
        if (!edgeSelection) {
          return false;
        }
        const { selection, contentItem } = edgeSelection;

        event?.preventDefault();
        event?.stopPropagation();
        const boundaryRoot = $resolveZoomBoundaryRoot(editor);
        const nextNote = getNextNoteInDocumentOrder(contentItem);
        const nextNoteOutsideBoundary =
          boundaryRoot !== null && nextNote !== null && !isContentDescendantOf(nextNote, boundaryRoot);

        const currentHasChildren = noteHasChildren(contentItem);
        const currentIsEmptyLeaf = !currentHasChildren && isEmptyNote(contentItem);

        if (currentIsEmptyLeaf) {
          if (boundaryRoot && contentItem.getKey() === boundaryRoot.getKey() && (!nextNote || nextNoteOutsideBoundary)) {
            return true;
          }

          const previousNote = getPreviousNoteInDocumentOrder(contentItem);
          if (!previousNote && !nextNote) {
            $selectItemEdge(contentItem, 'end');
            return true;
          }

          const caretPlan = resolveCaretPlanAfterRemoval(contentItem);
          removeNoteSubtree(contentItem);
          if (caretPlan) {
            $selectItemEdge(caretPlan.target, caretPlan.edge);
          }
          return true;
        }

        if (!nextNote) {
          return true;
        }
        if (nextNoteOutsideBoundary) {
          return true;
        }

        if (currentHasChildren && noteHasChildren(nextNote)) {
          return true;
        }

        return $mergeAtStartOfNote(selection, nextNote);
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
