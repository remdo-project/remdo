import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND } from '@/editor/commands';
import {
  flattenNoteNodes,
  getContentSiblings,
  getNodesForNote,
  insertAfter,
  insertBefore,
} from '@/editor/outline/list-structure';
import { resolveContentItemFromNode } from '@/editor/outline/schema';
import { getContiguousSelectionHeads } from '@/editor/outline/selection/heads';
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

interface SelectionContext {
  notes: ListItemNode[];
  parentList: ListNode;
  siblings: ListItemNode[];
}

function $getSelectionContext(): SelectionContext | null {
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

  return { notes, parentList, siblings };
};

function $moveSelectionDown(): boolean {
  const ctx = $getSelectionContext();
  if (!ctx) return false;
  const { notes, siblings } = ctx;
  return moveDownWithinList(notes, siblings);
}

function $moveSelectionUp(): boolean {
  const ctx = $getSelectionContext();
  if (!ctx) return false;
  const { notes, siblings } = ctx;
  return moveUpWithinList(notes, siblings);
}

export function ReorderingPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(REORDER_NOTES_UP_COMMAND, $moveSelectionUp, COMMAND_PRIORITY_LOW),
      editor.registerCommand(REORDER_NOTES_DOWN_COMMAND, $moveSelectionDown, COMMAND_PRIORITY_LOW)
    );
  }, [editor]);

  return null;
}
