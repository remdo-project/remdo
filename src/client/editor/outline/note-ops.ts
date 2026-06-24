import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import type { RangeSelection } from 'lexical';
import { $indentNote, $outdentNote } from '#client/editor/lexical-helpers';
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
import { isWithinEditingScope } from './editing-scope';
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

function canIndentNote(noteItem: ListItemNode, scopeRoot: ListItemNode | null): boolean {
  if (!isWithinEditingScope(noteItem, scopeRoot)) {
    return false;
  }

  const previous = getPreviousContentSibling(noteItem);
  if (!previous) {
    return false;
  }

  return isWithinEditingScope(previous, scopeRoot);
}

function canOutdentNote(noteItem: ListItemNode, scopeRoot: ListItemNode | null): boolean {
  if (!isWithinEditingScope(noteItem, scopeRoot)) {
    return false;
  }

  const parent = getParentContentItem(noteItem);
  if (!parent) {
    return false;
  }

  if (!scopeRoot) {
    return true;
  }

  if (!isContentDescendantOf(parent, scopeRoot)) {
    return false;
  }

  return parent.getKey() !== scopeRoot.getKey();
}

function $indentNotes(notes: ListItemNode[], scopeRoot: ListItemNode | null): boolean {
  if (notes.length === 0) {
    return false;
  }

  if (!notes.every((item) => canIndentNote(item, scopeRoot))) {
    return false;
  }

  for (const item of notes) {
    $indentNote(item);
  }

  return true;
}
export const indentNotes = $indentNotes;

function $indentNotesInRange(range: OutlineSelectionRange, scopeRoot: ListItemNode | null): boolean {
  return indentNotes($resolveStructuralHeadsFromRange(range), scopeRoot);
}
export const indentNotesInRange = $indentNotesInRange;

function $outdentNotes(notes: ListItemNode[], scopeRoot: ListItemNode | null): boolean {
  if (notes.length === 0) {
    return false;
  }

  if (!notes.every((item) => canOutdentNote(item, scopeRoot))) {
    return false;
  }

  for (const item of notes.toReversed()) {
    $outdentNote(item);
  }

  return true;
}
export const outdentNotes = $outdentNotes;

function $outdentNotesInRange(range: OutlineSelectionRange, scopeRoot: ListItemNode | null): boolean {
  return outdentNotes($resolveStructuralHeadsFromRange(range), scopeRoot);
}
export const outdentNotesInRange = $outdentNotesInRange;

type MoveDirection = 'up' | 'down';

interface ParentMoveContext {
  firstNote: ListItemNode;
  sourceList: ListNode;
  parentContent: ListItemNode;
}

function resolveMoveLeadNote(
  notes: ListItemNode[],
  scopeRoot: ListItemNode | null
): ListItemNode | null {
  if (!notes.every((note) => isWithinEditingScope(note, scopeRoot))) {
    return null;
  }

  return notes[0] ?? null;
}

function resolveParentMoveContext(
  notes: ListItemNode[],
  scopeRoot: ListItemNode | null
): ParentMoveContext | null {
  const firstNote = resolveMoveLeadNote(notes, scopeRoot);
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
  if (!isWithinEditingScope(parentContent, scopeRoot)) {
    return null;
  }

  return { firstNote, sourceList, parentContent };
}

function moveWithinList(
  notes: ListItemNode[],
  siblings: ListItemNode[],
  direction: MoveDirection,
  scopeRoot: ListItemNode | null
): boolean {
  const firstNote = resolveMoveLeadNote(notes, scopeRoot);
  if (!firstNote) {
    return false;
  }

  const startIndex = siblings.indexOf(firstNote);
  if (startIndex === -1) {
    return false;
  }

  const targetSibling = direction === 'down'
    ? siblings[startIndex + notes.length]
    : siblings[startIndex - 1];
  if (!targetSibling || !isWithinEditingScope(targetSibling, scopeRoot)) {
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
  scopeRoot: ListItemNode | null
): boolean {
  const context = resolveParentMoveContext(notes, scopeRoot);
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
  if (!isWithinEditingScope(targetParent, scopeRoot)) {
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

function outdentMoveFallback(notes: ListItemNode[], direction: MoveDirection, scopeRoot: ListItemNode | null): boolean {
  const context = resolveParentMoveContext(notes, scopeRoot);
  if (!context) {
    return false;
  }

  const { parentContent, sourceList } = context;
  if (scopeRoot && parentContent.getKey() === scopeRoot.getKey()) {
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

function resolveMovableHeads(notes: ListItemNode[], scopeRoot: ListItemNode | null): ListItemNode[] | null {
  if (notes.length === 0) {
    return null;
  }

  if (scopeRoot && !notes.every((note) => isWithinEditingScope(note, scopeRoot))) {
    return null;
  }

  return resolveContiguousSiblingRangeFromHeads(notes);
}

function $moveNotes(notes: ListItemNode[], direction: MoveDirection, scopeRoot: ListItemNode | null): boolean {
  const movableHeads = resolveMovableHeads(notes, scopeRoot);
  if (!movableHeads || movableHeads.length === 0) {
    return false;
  }

  const parentList = movableHeads[0]!.getParent();
  if (!$isListNode(parentList)) {
    return false;
  }

  const siblings = getContentSiblings(parentList);
  return (
    moveWithinList(movableHeads, siblings, direction, scopeRoot)
    || $moveToParentSiblingChildList(movableHeads, direction, scopeRoot)
    || outdentMoveFallback(movableHeads, direction, scopeRoot)
  );
}

function $moveNotesDown(notes: ListItemNode[], scopeRoot: ListItemNode | null): boolean {
  return $moveNotes(notes, 'down', scopeRoot);
}
export const moveNotesDown = $moveNotesDown;

function $moveNotesDownInRange(range: OutlineSelectionRange, scopeRoot: ListItemNode | null): boolean {
  return moveNotesDown($resolveStructuralHeadsFromRange(range), scopeRoot);
}
export const moveNotesDownInRange = $moveNotesDownInRange;

function $moveNotesUp(notes: ListItemNode[], scopeRoot: ListItemNode | null): boolean {
  return $moveNotes(notes, 'up', scopeRoot);
}
export const moveNotesUp = $moveNotesUp;

function $moveNotesUpInRange(range: OutlineSelectionRange, scopeRoot: ListItemNode | null): boolean {
  return moveNotesUp($resolveStructuralHeadsFromRange(range), scopeRoot);
}
export const moveNotesUpInRange = $moveNotesUpInRange;
