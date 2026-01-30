import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { waitFor } from '@testing-library/react';
import type { TextNode } from 'lexical';
import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
} from 'lexical';
import type { Outline } from '#tests-common/outline';
import { extractOutlineFromEditorState } from '#tests-common/outline';
import { findNearestListItem, getRootElementOrThrow } from './selection';
import { $getNoteId } from '#lib/editor/note-id-state';
import { expect } from 'vitest';
import { COLLAPSE_STRUCTURAL_SELECTION_COMMAND } from '@/editor/commands';
export type { Outline, OutlineNode } from '#tests-common/outline';
export type SelectionSnapshot =
  | { state: 'none' }
  | { state: 'caret'; note: string }
  | { state: 'inline'; note: string }
  | { state: 'structural'; notes: string[] };

export function $getNoteIdOrThrow(item: ListItemNode, message = 'Expected list item to have a noteId'): string {
  const noteId = $getNoteId(item);
  if (!noteId) {
    throw new Error(message);
  }
  return noteId;
}

function $findItemByNoteId(noteId: string): ListItemNode {
  const root = $getRoot();
  const list = root.getFirstChild();
  if (!list || !$isListNode(list)) {
    throw new Error(`No list item found with noteId: ${noteId}`);
  }
  const $search = (listNode: ListNode): ListItemNode | null => {
    const items = listNode.getChildren<ListItemNode>();
    for (const item of items) {
      if ($getNoteId(item) === noteId) {
        return item;
      }

      const nestedLists = item.getChildren().filter((child): child is ListNode => child.getType() === 'list');
      for (const nested of nestedLists) {
        const found = $search(nested);
        if (found) return found;
      }
    }
    return null;
  };

  const match = $search(list);
  if (!match) {
    throw new Error(`No list item found with noteId: ${noteId}`);
  }
  return match;
}

function placeCaretAtListItem(item: ListItemNode, offset: number) {
  const children = item.getChildren();
  const textNode = children.find((child): child is TextNode => child.getType() === 'text');

  if (textNode) {
    const length = textNode.getTextContentSize();
    const normalized = offset < 0 ? length + offset : offset;
    const clamped = Math.max(0, Math.min(length, normalized));
    textNode.select(clamped, clamped);
    return;
  }

  if (offset <= 0) {
    item.selectStart();
    return;
  }

  item.selectEnd();
}

export async function placeCaretAtNote(remdo: RemdoTestApi, noteId: string, offset = 0) {
  // Places a collapsed caret in the note, using text content when available.
  // Limitations: if the note has no text node, selection snaps to list item boundaries; selection may be promoted later by the app.
  const rootElement = getRootElementOrThrow(remdo.editor);
  if (document.activeElement !== rootElement) {
    rootElement.focus();
  }

  await remdo.dispatchCommand(COLLAPSE_STRUCTURAL_SELECTION_COMMAND, { edge: 'anchor' }, { expect: 'any' });

  await remdo.mutate(() => {
    const item = $findItemByNoteId(noteId);
    placeCaretAtListItem(item, offset);
  });

  await waitFor(() => {
    // Wait for both lexical and outline selection state to settle, so the progressive ladder resets.
    expect(readCaretNoteId(remdo)).toBe(noteId);
    expect(remdo.editor.selection.get()?.kind).toBe('caret');
  });
}

export async function placeCaretAtNoteTextNode(
  remdo: RemdoTestApi,
  noteId: string,
  textNodeIndex: number,
  offset: number
) {
  // Places a collapsed caret inside a specific text node (for multi-format notes).
  const rootElement = getRootElementOrThrow(remdo.editor);
  if (document.activeElement !== rootElement) {
    rootElement.focus();
  }

  await remdo.dispatchCommand(COLLAPSE_STRUCTURAL_SELECTION_COMMAND, { edge: 'anchor' }, { expect: 'any' });

  await remdo.mutate(() => {
    const item = $findItemByNoteId(noteId);
    const textNodes = item.getChildren().filter($isTextNode);
    const target = textNodes[textNodeIndex];
    if (!target) {
      throw new Error(`Expected text node ${textNodeIndex} on "${noteId}".`);
    }

    const length = target.getTextContentSize();
    const normalized = offset < 0 ? length + offset : offset;
    const clamped = Math.max(0, Math.min(length, normalized));

    const selection = $createRangeSelection();
    selection.setTextNodeRange(target, clamped, target, clamped);
    $setSelection(selection);
  });

  await waitFor(() => {
    expect(readCaretNoteId(remdo)).toBe(noteId);
    expect(remdo.editor.selection.get()?.kind).toBe('caret');
  });
}

/**
 * Appends text to the note with the given id without going through input events.
 * Use for deterministic model-only edits (e.g., remote collab changes).
 * For user-typing behavior, prefer {@link typeText} from keyboard helpers.
 */
export async function appendTextToNote(remdo: RemdoTestApi, noteId: string, text: string) {
  await remdo.mutate(() => {
    const item = $findItemByNoteId(noteId);

    const textNode = item.getChildren().find((child): child is TextNode => child.getType() === 'text');
    if (textNode) {
      textNode.setTextContent(`${textNode.getTextContent()}${text}`);
      return;
    }

    item.append($createTextNode(text));
  });
}

export function getNoteKey(remdo: RemdoTestApi, noteId: string): string {
  return remdo.validate(() => {
    const item = $findItemByNoteId(noteId);
    return item.getKey();
  });
}

export function readOutline(remdo: RemdoTestApi): Outline {
  return extractOutlineFromEditorState(remdo.getEditorState());
}
export async function selectEntireNote(remdo: RemdoTestApi, noteId: string): Promise<void> {
  // Selects the full text range of a single note.
  // Limitations: requires a text node in the note; does not simulate pointer selection.
  await placeCaretAtNote(remdo, noteId);

  await remdo.mutate(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      throw new Error('Expected range selection');
    }

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) {
      throw new Error('Expected text node selection anchor');
    }

    const length = anchorNode.getTextContentSize();
    selection.setTextNodeRange(anchorNode, 0, anchorNode, length);
  });
}
export function readCaretNoteKey(remdo: RemdoTestApi): string {
  // Reads the note key from a collapsed caret selection.
  return remdo.validate(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      throw new Error('Expected collapsed caret selection');
    }

    const item = findNearestListItem(selection.anchor.getNode()) ?? findNearestListItem(selection.focus.getNode());
    if (!item) {
      throw new Error('Expected caret to be inside a list item');
    }

    return item.getKey();
  });
}

export function readCaretNoteId(remdo: RemdoTestApi): string {
  // Reads the note id from a collapsed caret selection.
  return remdo.validate(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      throw new Error('Expected collapsed caret selection');
    }

    const item = findNearestListItem(selection.anchor.getNode()) ?? findNearestListItem(selection.focus.getNode());
    if (!item) {
      throw new Error('Expected caret to be inside a list item');
    }

    return $getNoteIdOrThrow(item, 'Expected caret note to have a noteId');
  });
}

function getNodePath(node: any): number[] {
  const path: number[] = [];
  let current: any = node;

  while (current) {
    const parent = typeof current.getParent === 'function' ? current.getParent() : null;
    if (!parent || typeof current.getIndexWithinParent !== 'function') {
      break;
    }
    path.push(current.getIndexWithinParent());
    current = parent;
  }

  return path.toReversed();
}

function compareNodeOrder(a: any, b: any): number {
  const aPath = getNodePath(a);
  const bPath = getNodePath(b);
  const depth = Math.max(aPath.length, bPath.length);

  for (let i = 0; i < depth; i++) {
    const left = aPath[i] ?? -1;
    const right = bPath[i] ?? -1;
    if (left !== right) {
      return left - right;
    }
  }

  return 0;
}

function findContentTextNode(item: ListItemNode) {
  return item
    .getChildren()
    .find(
      (child) =>
        typeof child.getType === 'function' &&
        child.getType() !== 'list' &&
        typeof (child as { getTextContent?: () => string }).getTextContent === 'function'
    );
}

export async function selectNoteRange(
  remdo: RemdoTestApi,
  startNoteId: string,
  endNoteId: string
): Promise<void> {
  // Creates a Lexical RangeSelection spanning note text (snaps to structural selection when it crosses notes).
  // Limitations: requires text nodes in both notes and does not simulate DOM pointer selection.
  if (startNoteId === endNoteId) {
    await selectEntireNote(remdo, startNoteId);
    return;
  }

  await remdo.mutate(() => {
    const startItem = $findItemByNoteId(startNoteId);
    const endItem = $findItemByNoteId(endNoteId);
    const startTextNode = findContentTextNode(startItem);
    const endTextNode = findContentTextNode(endItem);

    if (!startTextNode || !$isTextNode(startTextNode)) {
      throw new Error('Expected start text node with select capability');
    }
    if (!endTextNode || !$isTextNode(endTextNode)) {
      throw new Error('Expected end text node with select capability');
    }

    let selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      selection = $createRangeSelection();
      $setSelection(selection);
    }
    if (!$isRangeSelection(selection)) {
      throw new Error('Expected range selection');
    }

    const rangeSelection = selection;
    const startLength = startTextNode.getTextContentSize();
    const endLength = endTextNode.getTextContentSize();

    const order = compareNodeOrder(startItem, endItem);
    if (order <= 0) {
      rangeSelection.setTextNodeRange(startTextNode, 0, endTextNode, endLength);
    } else {
      rangeSelection.setTextNodeRange(startTextNode, startLength, endTextNode, 0);
    }
  });
}
