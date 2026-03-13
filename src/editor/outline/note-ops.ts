import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';
import { $indentNote, $outdentNote } from '@/editor/lexical-helpers';
import type { OutlineSelectionRange } from './selection/model';
import { $resolveStructuralHeadsFromRange } from './selection/range';
import {
  $getOrCreateChildList,
  flattenNoteNodes,
  getContentSiblings,
  getPreviousContentSibling,
  getNodesForNote,
  insertAfter,
  insertBefore,
  maybeRemoveEmptyWrapper,
} from './list-structure';
import { resolveContentItemFromNode } from './schema';
import { isWithinZoomBoundary } from './selection/boundary';
import { getContiguousSelectionHeads } from './selection/heads';
import { resolveContiguousSiblingRangeFromHeads } from './selection/sibling-run';
import { getNextContentSibling, getParentContentItem, isContentDescendantOf } from './selection/tree';

export function resolveRangeSelectionHeads(selection: RangeSelection): ListItemNode[] {
  const heads = getContiguousSelectionHeads(selection);
  if (heads.length > 0) {
    return heads;
  }

  if (!selection.isCollapsed()) {
    return [];
  }

  const contentItem = resolveContentItemFromNode(selection.anchor.getNode());
  return contentItem ? [contentItem] : [];
}

function canIndentNote(noteItem: ListItemNode, boundaryRoot: ListItemNode | null): boolean {
  if (!isWithinZoomBoundary(noteItem, boundaryRoot)) {
    return false;
  }

  const previous = getPreviousContentSibling(noteItem);
  if (!previous) {
    return false;
  }

  return isWithinZoomBoundary(previous, boundaryRoot);
}

function canOutdentNote(noteItem: ListItemNode, boundaryRoot: ListItemNode | null): boolean {
  if (!isWithinZoomBoundary(noteItem, boundaryRoot)) {
    return false;
  }

  const parent = getParentContentItem(noteItem);
  if (!parent) {
    return false;
  }

  if (!boundaryRoot) {
    return true;
  }

  if (!isContentDescendantOf(parent, boundaryRoot)) {
    return false;
  }

  return parent.getKey() !== boundaryRoot.getKey();
}

function $indentNotes(notes: ListItemNode[], boundaryRoot: ListItemNode | null): boolean {
  if (notes.length === 0) {
    return false;
  }

  if (!notes.every((item) => canIndentNote(item, boundaryRoot))) {
    return false;
  }

  for (const item of notes) {
    $indentNote(item);
  }

  return true;
}
export const indentNotes = $indentNotes;

function $indentNotesInRange(range: OutlineSelectionRange, boundaryRoot: ListItemNode | null): boolean {
  return indentNotes($resolveStructuralHeadsFromRange(range), boundaryRoot);
}
export const indentNotesInRange = $indentNotesInRange;

function $outdentNotes(notes: ListItemNode[], boundaryRoot: ListItemNode | null): boolean {
  if (notes.length === 0) {
    return false;
  }

  if (!notes.every((item) => canOutdentNote(item, boundaryRoot))) {
    return false;
  }

  for (const item of notes.toReversed()) {
    $outdentNote(item);
  }

  return true;
}
export const outdentNotes = $outdentNotes;

function $outdentNotesInRange(range: OutlineSelectionRange, boundaryRoot: ListItemNode | null): boolean {
  return outdentNotes($resolveStructuralHeadsFromRange(range), boundaryRoot);
}
export const outdentNotesInRange = $outdentNotesInRange;

type MoveDirection = 'up' | 'down';

interface ParentMoveContext {
  firstNote: ListItemNode;
  sourceList: ListNode;
  parentContent: ListItemNode;
}

function resolveParentMoveContext(
  notes: ListItemNode[],
  boundaryRoot: ListItemNode | null
): ParentMoveContext | null {
  if (!notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
    return null;
  }

  const firstNote = notes[0];
  if (!firstNote) {
    return null;
  }

  const sourceList = firstNote.getParent();
  if (!$isListNode(sourceList)) {
    return null;
  }

  const parentContent = getParentContentItem(firstNote);
  if (!parentContent) {
    return null;
  }
  if (!isWithinZoomBoundary(parentContent, boundaryRoot)) {
    return null;
  }

  return { firstNote, sourceList, parentContent };
}

function moveWithinList(
  notes: ListItemNode[],
  siblings: ListItemNode[],
  direction: MoveDirection,
  boundaryRoot: ListItemNode | null
): boolean {
  const context = resolveParentMoveContext(notes, boundaryRoot);
  if (!context) {
    return false;
  }

  const { firstNote } = context;
  const startIndex = siblings.indexOf(firstNote);
  if (startIndex === -1) {
    return false;
  }

  const targetSibling = direction === 'down'
    ? siblings[startIndex + notes.length]
    : siblings[startIndex - 1];
  if (!targetSibling || !isWithinZoomBoundary(targetSibling, boundaryRoot)) {
    return false;
  }
  const nodesToMove = flattenNoteNodes(notes);
  if (direction === 'down') {
    const targetNodes = getNodesForNote(targetSibling);
    const reference = targetNodes.at(-1);
    if (!reference) {
      return false;
    }
    insertAfter(reference, nodesToMove);
  } else {
    insertBefore(targetSibling, nodesToMove);
  }

  return true;
}

function $moveToParentSiblingChildList(
  notes: ListItemNode[],
  direction: MoveDirection,
  boundaryRoot: ListItemNode | null
): boolean {
  const context = resolveParentMoveContext(notes, boundaryRoot);
  if (!context) {
    return false;
  }

  const { parentContent, sourceList } = context;
  const targetParent =
    direction === 'down'
      ? getNextContentSibling(parentContent)
      : getPreviousContentSibling(parentContent);
  if (!targetParent) {
    return false;
  }
  if (!isWithinZoomBoundary(targetParent, boundaryRoot)) {
    return false;
  }

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

function outdentMoveFallback(notes: ListItemNode[], direction: MoveDirection, boundaryRoot: ListItemNode | null): boolean {
  const context = resolveParentMoveContext(notes, boundaryRoot);
  if (!context) {
    return false;
  }

  const { parentContent, sourceList } = context;
  if (boundaryRoot && parentContent.getKey() === boundaryRoot.getKey()) {
    return false;
  }

  const nodesToMove = flattenNoteNodes(notes);
  if (direction === 'down') {
    const parentNodes = getNodesForNote(parentContent);
    const parentTail = parentNodes.at(-1);
    if (!parentTail) {
      return false;
    }
    insertAfter(parentTail, nodesToMove);
  } else {
    insertBefore(parentContent, nodesToMove);
  }

  maybeRemoveEmptyWrapper(sourceList);
  return true;
}

function resolveMovableHeads(notes: ListItemNode[], boundaryRoot: ListItemNode | null): ListItemNode[] | null {
  if (notes.length === 0) {
    return null;
  }

  if (boundaryRoot && !notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
    return null;
  }

  return resolveContiguousSiblingRangeFromHeads(notes);
}

function $moveNotes(notes: ListItemNode[], direction: MoveDirection, boundaryRoot: ListItemNode | null): boolean {
  const movableHeads = resolveMovableHeads(notes, boundaryRoot);
  if (!movableHeads || movableHeads.length === 0) {
    return false;
  }

  const parentList = movableHeads[0]!.getParent();
  if (!$isListNode(parentList)) {
    return false;
  }

  const siblings = getContentSiblings(parentList);
  return (
    moveWithinList(movableHeads, siblings, direction, boundaryRoot)
    || $moveToParentSiblingChildList(movableHeads, direction, boundaryRoot)
    || outdentMoveFallback(movableHeads, direction, boundaryRoot)
  );
}

function $moveNotesDown(notes: ListItemNode[], boundaryRoot: ListItemNode | null): boolean {
  return $moveNotes(notes, 'down', boundaryRoot);
}
export const moveNotesDown = $moveNotesDown;

function $moveNotesDownInRange(range: OutlineSelectionRange, boundaryRoot: ListItemNode | null): boolean {
  return moveNotesDown($resolveStructuralHeadsFromRange(range), boundaryRoot);
}
export const moveNotesDownInRange = $moveNotesDownInRange;

function $moveNotesUp(notes: ListItemNode[], boundaryRoot: ListItemNode | null): boolean {
  return $moveNotes(notes, 'up', boundaryRoot);
}
export const moveNotesUp = $moveNotesUp;

function $moveNotesUpInRange(range: OutlineSelectionRange, boundaryRoot: ListItemNode | null): boolean {
  return moveNotesUp($resolveStructuralHeadsFromRange(range), boundaryRoot);
}
export const moveNotesUpInRange = $moveNotesUpInRange;
