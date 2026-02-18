import type { ListItemNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND } from '@/editor/commands';
import {
  $getOrCreateChildList,
  flattenNoteNodes,
  getContentSiblings,
  getPreviousContentSibling,
  getNodesForNote,
  insertAfter,
  insertBefore,
  maybeRemoveEmptyWrapper,
} from '@/editor/outline/list-structure';
import { resolveContentItemFromNode } from '@/editor/outline/schema';
import {
  $resolveZoomBoundaryRoot,
  isWithinZoomBoundary,
} from '@/editor/outline/selection/boundary';
import { getContiguousSelectionHeads } from '@/editor/outline/selection/heads';
import { getNextContentSibling, getParentContentItem } from '@/editor/outline/selection/tree';
import { useEffect } from 'react';
import { mergeRegister } from '@lexical/utils';


function moveDownWithinList(notes: ListItemNode[], siblings: ListItemNode[], boundaryRoot: ListItemNode | null): boolean {
  if (!notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
    return false;
  }

  const firstNote = notes[0];
  if (!firstNote) return false;

  const startIndex = siblings.indexOf(firstNote);
  if (startIndex === -1) return false;
  const endIndex = startIndex + notes.length - 1;
  const nextSibling = siblings[endIndex + 1];
  if (!nextSibling) return false;
  if (!isWithinZoomBoundary(nextSibling, boundaryRoot)) return false;

  const nodesToMove = flattenNoteNodes(notes);
  const targetNodes = getNodesForNote(nextSibling);
  const reference = targetNodes.at(-1);
  if (!reference) return false;
  insertAfter(reference, nodesToMove);
  return true;
}

function moveUpWithinList(notes: ListItemNode[], siblings: ListItemNode[], boundaryRoot: ListItemNode | null): boolean {
  if (!notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
    return false;
  }

  const firstNote = notes[0];
  if (!firstNote) return false;

  const startIndex = siblings.indexOf(firstNote);
  if (startIndex === -1) return false;
  const previousSibling = siblings[startIndex - 1];
  if (!previousSibling) return false;
  if (!isWithinZoomBoundary(previousSibling, boundaryRoot)) return false;

  const nodesToMove = flattenNoteNodes(notes);
  insertBefore(previousSibling, nodesToMove);
  return true;
}

function $moveToParentSiblingChildList(
  notes: ListItemNode[],
  direction: 'up' | 'down',
  boundaryRoot: ListItemNode | null
): boolean {
  if (!notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
    return false;
  }

  const firstNote = notes[0];
  if (!firstNote) return false;

  const sourceList = firstNote.getParent();
  if (!$isListNode(sourceList)) return false;

  const parentContent = getParentContentItem(firstNote);
  if (!parentContent) return false;
  if (!isWithinZoomBoundary(parentContent, boundaryRoot)) return false;

  const targetParent =
    direction === 'down'
      ? getNextContentSibling(parentContent)
      : getPreviousContentSibling(parentContent);
  if (!targetParent) return false;
  if (!isWithinZoomBoundary(targetParent, boundaryRoot)) return false;

  const nodesToMove = flattenNoteNodes(notes);
  const targetList = $getOrCreateChildList(targetParent);

  if (direction === 'down') {
    const targetSiblings = getContentSiblings(targetList);
    const firstChild = targetSiblings[0];
    if (firstChild) {
      insertBefore(firstChild, nodesToMove);
    } else {
      targetList.append(...nodesToMove);
    }
  } else {
    targetList.append(...nodesToMove);
  }

  maybeRemoveEmptyWrapper(sourceList);
  return true;
}

function outdentSelection(notes: ListItemNode[], direction: 'up' | 'down', boundaryRoot: ListItemNode | null): boolean {
  if (!notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
    return false;
  }

  const firstNote = notes[0];
  if (!firstNote) return false;

  const sourceList = firstNote.getParent();
  if (!$isListNode(sourceList)) return false;

  const parentContent = getParentContentItem(firstNote);
  if (!parentContent) return false;
  if (!isWithinZoomBoundary(parentContent, boundaryRoot)) return false;
  if (boundaryRoot && parentContent.getKey() === boundaryRoot.getKey()) {
    return false;
  }

  const nodesToMove = flattenNoteNodes(notes);
  if (direction === 'down') {
    const parentNodes = getNodesForNote(parentContent);
    const parentTail = parentNodes.at(-1);
    if (!parentTail) return false;
    insertAfter(parentTail, nodesToMove);
  } else {
    insertBefore(parentContent, nodesToMove);
  }

  maybeRemoveEmptyWrapper(sourceList);
  return true;
}

interface SelectionContext {
  notes: ListItemNode[];
  siblings: ListItemNode[];
}

function $getSelectionContext(boundaryRoot: ListItemNode | null): SelectionContext | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;

  let notes = getContiguousSelectionHeads(selection);

  if (notes.length === 0 && selection.isCollapsed()) {
    const caretItem = resolveContentItemFromNode(selection.anchor.getNode());
    if (caretItem) {
      notes = [caretItem];
    }
  }

  const [first] = notes;
  if (!first) return null;

  const parentList = first.getParent();
  if (!$isListNode(parentList)) return null;

  const siblings = getContentSiblings(parentList);
  if (boundaryRoot && !notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
    return null;
  }

  return { notes, siblings };
};

function $moveSelectionDown(boundaryRoot: ListItemNode | null): boolean {
  const ctx = $getSelectionContext(boundaryRoot);
  if (!ctx) return false;
  const { notes, siblings } = ctx;
  return (
    moveDownWithinList(notes, siblings, boundaryRoot)
    || $moveToParentSiblingChildList(notes, 'down', boundaryRoot)
    || outdentSelection(notes, 'down', boundaryRoot)
  );
}

function $moveSelectionUp(boundaryRoot: ListItemNode | null): boolean {
  const ctx = $getSelectionContext(boundaryRoot);
  if (!ctx) return false;
  const { notes, siblings } = ctx;
  return (
    moveUpWithinList(notes, siblings, boundaryRoot)
    || $moveToParentSiblingChildList(notes, 'up', boundaryRoot)
    || outdentSelection(notes, 'up', boundaryRoot)
  );
}

export function ReorderingPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const $moveUp = () => {
      const boundaryRoot = $resolveZoomBoundaryRoot(editor);
      return $moveSelectionUp(boundaryRoot);
    };
    const $moveDown = () => {
      const boundaryRoot = $resolveZoomBoundaryRoot(editor);
      return $moveSelectionDown(boundaryRoot);
    };

    return mergeRegister(
      editor.registerCommand(REORDER_NOTES_UP_COMMAND, $moveUp, COMMAND_PRIORITY_LOW),
      editor.registerCommand(REORDER_NOTES_DOWN_COMMAND, $moveDown, COMMAND_PRIORITY_LOW)
    );
  }, [editor]);

  return null;
}
