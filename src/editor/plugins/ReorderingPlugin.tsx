import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical';
import type { LexicalNode } from 'lexical';
import { MOVE_SELECTION_DOWN_COMMAND, MOVE_SELECTION_UP_COMMAND } from '@/editor/commands';
import {
  $getOrCreateChildList,
  findNearestListItem,
  flattenNoteNodes,
  getContentListItem,
  getContentSiblings,
  getNodesForNote,
  getParentNote,
  insertAfter,
  insertBefore,
  isChildrenWrapper,
  maybeRemoveEmptyWrapper,
} from '@/editor/outline/list-structure';
import { getContiguousSelectionHeads } from '@/editor/outline/structural-selection';
import { useEffect } from 'react';
import { mergeRegister } from '@lexical/utils';

function moveDownWithinList(notes: ListItemNode[], siblings: ListItemNode[]): boolean {
  const firstNote = notes[0];
  if (!firstNote) return false;

  const startIndex = siblings.indexOf(firstNote);
  if (startIndex === -1) return false;
  const endIndex = startIndex + notes.length - 1;
  const nextSibling = siblings[endIndex + 1];
  if (!nextSibling) return false;

  const nodesToMove = flattenNoteNodes(notes);
  const targetNodes = getNodesForNote(nextSibling);
  const reference = targetNodes.at(-1);
  if (!reference) return false;
  insertAfter(reference, nodesToMove);
  return true;
}

function moveUpWithinList(notes: ListItemNode[], siblings: ListItemNode[]): boolean {
  const firstNote = notes[0];
  if (!firstNote) return false;

  const startIndex = siblings.indexOf(firstNote);
  if (startIndex === -1) return false;
  const previousSibling = siblings[startIndex - 1];
  if (!previousSibling) return false;

  const nodesToMove = flattenNoteNodes(notes);
  insertBefore(previousSibling, nodesToMove);
  return true;
}

function $moveDownAcrossBoundary(notes: ListItemNode[], parentList: ListNode): boolean {
  const parentNote = getParentNote(parentList);
  if (!parentNote) return false;

  const grandParentList = parentNote.getParent();
  if (!$isListNode(grandParentList)) return false;

  const parentSiblings = getContentSiblings(grandParentList);
  const parentIndex = parentSiblings.indexOf(parentNote);
  if (parentIndex === -1) return false;
  const nextParent = parentSiblings[parentIndex + 1];

  const nodesToMove = flattenNoteNodes(notes);

  if (nextParent) {
    const targetChildList = $getOrCreateChildList(nextParent);
    const firstChild = targetChildList.getFirstChild();
    if (firstChild) {
      insertBefore(firstChild, nodesToMove);
    } else {
      targetChildList.append(...nodesToMove);
    }
    maybeRemoveEmptyWrapper(parentList);
    return true;
  }

  // Outdent after parent when there is no next parent sibling
  let reference: LexicalNode = parentNote;
  const maybeWrapper = parentNote.getNextSibling();
  if (isChildrenWrapper(maybeWrapper)) {
    reference = maybeWrapper;
  }
  insertAfter(reference, nodesToMove);
  maybeRemoveEmptyWrapper(parentList);
  return true;
}

function $moveUpAcrossBoundary(notes: ListItemNode[], parentList: ListNode): boolean {
  const parentNote = getParentNote(parentList);
  if (!parentNote) return false;

  const grandParentList = parentNote.getParent();
  if (!$isListNode(grandParentList)) return false;

  const parentSiblings = getContentSiblings(grandParentList);
  const parentIndex = parentSiblings.indexOf(parentNote);
  if (parentIndex === -1) return false;
  const previousParent = parentSiblings[parentIndex - 1];

  const nodesToMove = flattenNoteNodes(notes);

  if (previousParent) {
    const targetChildList = $getOrCreateChildList(previousParent);
    targetChildList.append(...nodesToMove);
    maybeRemoveEmptyWrapper(parentList);
    return true;
  }

  // Outdent before parent when there is no previous parent sibling
  insertBefore(parentNote, nodesToMove);
  maybeRemoveEmptyWrapper(parentList);
  return true;
}

interface SelectionContext {
  notes: ListItemNode[];
  parentList: ListNode;
  siblings: ListItemNode[];
}

function $getSelectionContext(): SelectionContext | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;

  const slice = getContiguousSelectionHeads(selection);
  let notes = slice?.heads ?? [];

  if (notes.length === 0 && selection.isCollapsed()) {
    const caretItem = findNearestListItem(selection.anchor.getNode());
    if (caretItem) {
      notes = [getContentListItem(caretItem)];
    }
  }

  const [first] = notes;
  if (!first) return null;

  const parentList = first.getParent();
  if (!$isListNode(parentList)) return null;

  const siblings = getContentSiblings(parentList);

  return { notes, parentList, siblings };
};

function $moveSelectionDown(): boolean {
  const ctx = $getSelectionContext();
  if (!ctx) return false;
  const { notes, siblings, parentList } = ctx;
  return moveDownWithinList(notes, siblings) || $moveDownAcrossBoundary(notes, parentList);
}

function $moveSelectionUp(): boolean {
  const ctx = $getSelectionContext();
  if (!ctx) return false;
  const { notes, siblings, parentList } = ctx;
  return moveUpWithinList(notes, siblings) || $moveUpAcrossBoundary(notes, parentList);
}

export function ReorderingPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(MOVE_SELECTION_UP_COMMAND, $moveSelectionUp, COMMAND_PRIORITY_LOW),
      editor.registerCommand(MOVE_SELECTION_DOWN_COMMAND, $moveSelectionDown, COMMAND_PRIORITY_LOW)
    );
  }, [editor]);

  return null;
}

export default ReorderingPlugin;
