//TODO review, refactor, simplify, extract common helpers
import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical';
import type { LexicalNode, TextNode } from 'lexical';
import { DELETE_SELECTED_NOTES_COMMAND } from '#client/editor/commands';
import { useEffect, useState } from 'react';
import {
  $getOrCreateChildList,
  flattenNoteNodes,
  getBodyWrapper,
  getContentSiblings,
  getPreviousContentSibling,
  insertBefore,
} from '#client/editor/outline/list-structure';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import { $resolveZoomRoot } from '#client/editor/features/zoom/zoom-root';
import { $selectItemEdge } from '#client/editor/outline/selection/caret';
import { $deleteSelectedNotes } from '#client/editor/outline/selection/delete-selection';
import {
  getFirstDescendantListItem,
  getNestedList,
  getNextContentSibling,
  noteHasChildren,
  getParentContentItem,
  getSubtreeTail,
  removeNoteSubtree,
  isContentDescendantOf,
} from '#client/editor/outline/selection/tree';
import { getNoteBody, isNoteBodyEmpty } from '#client/editor/features/note-body/note-body-ops';

const TRAILING_WHITESPACE_PATTERN = /\s$/;
const LEADING_WHITESPACE_PATTERN = /^\s/;

function getParentNote(list: ListNode): ListItemNode | null {
  const wrapper = list.getParent();
  if (!$isListItemNode(wrapper)) {
    return null;
  }

  // The parent note sits before the children-wrapper, after any body-wrapper.
  return getPreviousContentSibling(wrapper);
}

// Before `removed` is deleted in a merge, carry its body (if any) to `survivor`.
// The both-bodies case is rejected earlier, so the survivor has no body here; the
// body-wrapper sits immediately after the survivor's content item.
function $carryBodyToSurvivor(removed: ListItemNode, survivor: ListItemNode): void {
  const bodyWrapper = getBodyWrapper(removed);
  if (bodyWrapper) {
    survivor.insertAfter(bodyWrapper);
  }
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
    !TRAILING_WHITESPACE_PATTERN.test(left) &&
    right.length > 0 &&
    !LEADING_WHITESPACE_PATTERN.test(right);

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

// True when the note has no body or an empty one. A non-empty body means the
// note carries content beyond its label, so it must not be removed as empty.
function $noteBodyIsEmpty(item: ListItemNode): boolean {
  const body = getNoteBody(item);
  return body === null || isNoteBodyEmpty(body);
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
      if (!$deleteSelectedNotes(editor)) {
        return false;
      }
      event?.preventDefault();
      event?.stopPropagation();
      return true;
    };

    const $mergeAtStartOfNote = (selection: ReturnType<typeof $getSelection>, current: ListItemNode): boolean => {
      const target = getPreviousNoteInDocumentOrder(current);
      if (!target) {
        return true;
      }

      // Body merge contract (docs/outliner/body.md "Note merge"): if both notes
      // have a body the merge is a no-op so no body is lost. Otherwise the merge
      // proceeds and the surviving note keeps the single body, carrying it over
      // from the removed note when needed.
      if (getBodyWrapper(current) && getBodyWrapper(target)) {
        return true;
      }

      const currentHasChildren = noteHasChildren(current);
      const targetHasChildren = noteHasChildren(target);
      const currentIsEmptyLeaf = !currentHasChildren && isEmptyNote(current);
      const targetIsEmptyLeaf = !targetHasChildren && isEmptyNote(target);

      if (targetIsEmptyLeaf) {
        $carryBodyToSurvivor(target, current);
        removeNoteSubtree(target);
        $selectItemEdge(current, 'start');
        return true;
      }

      if (currentIsEmptyLeaf) {
        $carryBodyToSurvivor(current, target);
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

      $carryBodyToSurvivor(current, target);
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
        const zoomRoot = $resolveZoomRoot(editor);
        if (zoomRoot && contentItem.getKey() === zoomRoot.getKey()) {
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
        const zoomRoot = $resolveZoomRoot(editor);
        const nextNote = getNextNoteInDocumentOrder(contentItem);
        const nextNoteOutsideZoomRoot =
          zoomRoot !== null && nextNote !== null && !isContentDescendantOf(nextNote, zoomRoot);

        const currentHasChildren = noteHasChildren(contentItem);
        // A note that owns a non-empty body is not a removable empty leaf: the
        // Delete fast path removes the whole subtree (body-wrapper included)
        // without carrying the body, so treating it as empty would lose the body
        // text. Fall through to the merge path, which carries the body over.
        const currentIsEmptyLeaf =
          !currentHasChildren && isEmptyNote(contentItem) && $noteBodyIsEmpty(contentItem);

        if (currentIsEmptyLeaf) {
          if (zoomRoot && contentItem.getKey() === zoomRoot.getKey() && (!nextNote || nextNoteOutsideZoomRoot)) {
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
        if (nextNoteOutsideZoomRoot) {
          return true;
        }

        if (currentHasChildren && noteHasChildren(nextNote)) {
          return true;
        }

        return $mergeAtStartOfNote(selection, nextNote);
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterDeleteCommand = editor.registerCommand(
      DELETE_SELECTED_NOTES_COMMAND,
      () => $deleteSelectedNotes(editor),
      COMMAND_PRIORITY_LOW
    );

    return () => {
      unregisterBackspace();
      unregisterDelete();
      unregisterDeleteCommand();
    };
  }, [editor]);

  return null;
}
