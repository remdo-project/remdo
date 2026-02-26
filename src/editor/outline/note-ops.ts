import type { ListItemNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';
import { $indentNote, $outdentNote } from '@/editor/lexical-helpers';
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

function moveDownWithinList(notes: ListItemNode[], siblings: ListItemNode[], boundaryRoot: ListItemNode | null): boolean {
  if (!notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
    return false;
  }

  const firstNote = notes[0];
  if (!firstNote) {
    return false;
  }

  const startIndex = siblings.indexOf(firstNote);
  if (startIndex === -1) {
    return false;
  }
  const endIndex = startIndex + notes.length - 1;
  const nextSibling = siblings[endIndex + 1];
  if (!nextSibling) {
    return false;
  }
  if (!isWithinZoomBoundary(nextSibling, boundaryRoot)) {
    return false;
  }

  const nodesToMove = flattenNoteNodes(notes);
  const targetNodes = getNodesForNote(nextSibling);
  const reference = targetNodes.at(-1);
  if (!reference) {
    return false;
  }

  insertAfter(reference, nodesToMove);
  return true;
}

function moveUpWithinList(notes: ListItemNode[], siblings: ListItemNode[], boundaryRoot: ListItemNode | null): boolean {
  if (!notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
    return false;
  }

  const firstNote = notes[0];
  if (!firstNote) {
    return false;
  }

  const startIndex = siblings.indexOf(firstNote);
  if (startIndex === -1) {
    return false;
  }
  const previousSibling = siblings[startIndex - 1];
  if (!previousSibling) {
    return false;
  }
  if (!isWithinZoomBoundary(previousSibling, boundaryRoot)) {
    return false;
  }

  insertBefore(previousSibling, flattenNoteNodes(notes));
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
  if (!firstNote) {
    return false;
  }

  const sourceList = firstNote.getParent();
  if (!$isListNode(sourceList)) {
    return false;
  }

  const parentContent = getParentContentItem(firstNote);
  if (!parentContent) {
    return false;
  }
  if (!isWithinZoomBoundary(parentContent, boundaryRoot)) {
    return false;
  }

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

function outdentMoveFallback(notes: ListItemNode[], direction: 'up' | 'down', boundaryRoot: ListItemNode | null): boolean {
  if (!notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
    return false;
  }

  const firstNote = notes[0];
  if (!firstNote) {
    return false;
  }

  const sourceList = firstNote.getParent();
  if (!$isListNode(sourceList)) {
    return false;
  }

  const parentContent = getParentContentItem(firstNote);
  if (!parentContent) {
    return false;
  }
  if (!isWithinZoomBoundary(parentContent, boundaryRoot)) {
    return false;
  }
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
  const first = notes[0];
  if (!first) {
    return null;
  }

  if (boundaryRoot && !notes.every((note) => isWithinZoomBoundary(note, boundaryRoot))) {
    return null;
  }

  const parentList = first.getParent();
  if (!$isListNode(parentList)) {
    return null;
  }
  if (!notes.every((note) => note.getParent() === parentList)) {
    return null;
  }

  const siblings = getContentSiblings(parentList);
  const indexes = notes.map((note) => siblings.indexOf(note));
  if (indexes.includes(-1)) {
    return null;
  }

  const sortedIndexes = indexes.toSorted((left, right) => left - right);
  const startIndex = sortedIndexes[0];
  const endIndex = sortedIndexes.at(-1);
  if (startIndex === undefined || endIndex === undefined) {
    return null;
  }

  if (endIndex - startIndex + 1 !== notes.length) {
    return null;
  }

  return siblings.slice(startIndex, endIndex + 1);
}

function $moveNotesDown(notes: ListItemNode[], boundaryRoot: ListItemNode | null): boolean {
  const movableHeads = resolveMovableHeads(notes, boundaryRoot);
  if (!movableHeads || movableHeads.length === 0) {
    return false;
  }

  const first = movableHeads[0];
  if (!first) {
    return false;
  }

  const parentList = first.getParent();
  if (!$isListNode(parentList)) {
    return false;
  }

  const siblings = getContentSiblings(parentList);
  return (
    moveDownWithinList(movableHeads, siblings, boundaryRoot)
    || $moveToParentSiblingChildList(movableHeads, 'down', boundaryRoot)
    || outdentMoveFallback(movableHeads, 'down', boundaryRoot)
  );
}
export const moveNotesDown = $moveNotesDown;

function $moveNotesUp(notes: ListItemNode[], boundaryRoot: ListItemNode | null): boolean {
  const movableHeads = resolveMovableHeads(notes, boundaryRoot);
  if (!movableHeads || movableHeads.length === 0) {
    return false;
  }

  const first = movableHeads[0];
  if (!first) {
    return false;
  }

  const parentList = first.getParent();
  if (!$isListNode(parentList)) {
    return false;
  }

  const siblings = getContentSiblings(parentList);
  return (
    moveUpWithinList(movableHeads, siblings, boundaryRoot)
    || $moveToParentSiblingChildList(movableHeads, 'up', boundaryRoot)
    || outdentMoveFallback(movableHeads, 'up', boundaryRoot)
  );
}
export const moveNotesUp = $moveNotesUp;
