import type { ListItemNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { RemdoTestApi } from '#client/editor/dev';
import { waitFor } from '@testing-library/react';
import type { TextNode } from 'lexical';
import {
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
} from 'lexical';
import type { Outline } from '#tests-common/outline';
import { extractOutlineFromEditorState } from '#tests-common/outline';
import { findNearestListItem, getRootElementOrThrow } from './selection';
import { $getNoteId } from '#client/editor/runtime/note-ids/note-id-state';
import { forEachContentItemInOutline } from '#client/editor/outline/list-traversal';
import { getNoteOwnText } from '#client/editor/outline/selection/note-body';
import { $setNoteCheckedRaw } from '#client/editor/features/list-types/checked-state';
import { expect } from 'vitest';
import { COLLAPSE_STRUCTURAL_SELECTION_COMMAND } from '#client/editor/foundation/commands';
export type { Outline, OutlineNode } from '#tests-common/outline';
export type SelectionSnapshot =
  | { state: 'none' }
  | { state: 'caret'; note: string }
  | { state: 'inline'; note: string }
  | { state: 'structural'; notes: string[] };

export function $getNoteIdOrThrow(item: ListItemNode, message = 'Expected list item to have a noteId'): string {
  const noteId = $getNoteId(item);
  if (!noteId) {
    throw new TypeError(message);
  }
  return noteId;
}

export function $getListItemByKeyOrThrow(key: string, label = key): ListItemNode {
  const node = $getNodeByKey(key);
  if (!$isListItemNode(node)) {
    throw new TypeError(`Expected ${label} to resolve to a list item`);
  }
  return node;
}

/**
 * A note in a test: its text, which must match exactly one note, or `{ id }` when the test is
 * about identity, its text repeats, or its text is awkward to spell, such as a link label.
 */
export type NoteRef = string | { id: string };

function $getNote(note: NoteRef): ListItemNode {
  const matches: ListItemNode[] = [];
  // A malformed root, as a schema-bypass fixture holds before normalization, has no notes to
  // find; the editor's own root helper would also report it as a runtime invariant.
  const rootList = $getRoot().getFirstChild();
  if ($isListNode(rootList)) forEachContentItemInOutline(rootList, (item) => {
    if (typeof note === 'string' ? getNoteOwnText(item) === note : $getNoteId(item) === note.id) {
      matches.push(item);
    }
  });
  if (matches.length !== 1) {
    const described = typeof note === 'string' ? `with text ${JSON.stringify(note)}` : `with id ${note.id}`;
    throw new Error(`Expected exactly one note ${described}, found ${matches.length}`);
  }
  return matches[0]!;
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

// Lexical 0.49 requires the editor root to hold DOM focus before a programmatic selection
// mutation, or the selection is discarded before it reaches the editor state.
function focusEditorRootElement(remdo: RemdoTestApi): void {
  const rootElement = getRootElementOrThrow(remdo.editor);
  if (document.activeElement !== rootElement) {
    rootElement.focus();
  }
}

/** The one note whose own text is `text`; throws when none or several match. */
export function $getNoteByText(text: string): ListItemNode {
  return $getNote(text);
}

/** The one note with this ID; throws when none or several match. */
export function $getNoteById(id: string): ListItemNode {
  return $getNote({ id });
}

export async function placeCaretAtNote(remdo: RemdoTestApi, note: NoteRef, offset = 0) {
  // Places a collapsed caret in the note, using text content when available.
  // Limitations: if the note has no text node, selection snaps to list item boundaries; selection may be promoted later by the app.
  focusEditorRootElement(remdo);

  await remdo.dispatchCommand(COLLAPSE_STRUCTURAL_SELECTION_COMMAND, { edge: 'anchor' }, { expect: 'any' });

  let noteId = '';
  await remdo.mutate(() => {
    const item = $getNote(note);
    noteId = $getNoteIdOrThrow(item);
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
  note: NoteRef,
  textNodeIndex: number,
  offset: number
) {
  // Places a collapsed caret inside a specific text node (for multi-format notes).
  focusEditorRootElement(remdo);

  await remdo.dispatchCommand(COLLAPSE_STRUCTURAL_SELECTION_COMMAND, { edge: 'anchor' }, { expect: 'any' });

  let noteId = '';
  await remdo.mutate(() => {
    const item = $getNote(note);
    noteId = $getNoteIdOrThrow(item);
    const textNodes = item.getChildren().filter($isTextNode);
    const target = textNodes[textNodeIndex]!;

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

export function getNoteKey(remdo: RemdoTestApi, note: NoteRef): string {
  return remdo.validate(() => $getNote(note).getKey());
}

export function isSameNote(remdo: RemdoTestApi, a: NoteRef, b: NoteRef): boolean {
  return a === b || getNoteKey(remdo, a) === getNoteKey(remdo, b);
}

export function getNoteIdOf(remdo: RemdoTestApi, note: NoteRef): string {
  return remdo.validate(() => $getNoteIdOrThrow($getNote(note)));
}

// Test-only helper for precise fixture setup. This bypasses recursive checklist
// command semantics and writes per-note storage state directly.
export async function setRawNoteCheckedState(remdo: RemdoTestApi, note: NoteRef, checked: boolean) {
  await remdo.mutate(() => {
    $setNoteCheckedRaw($getNote(note), checked);
  });
}

export function readOutline(remdo: RemdoTestApi): Outline {
  return extractOutlineFromEditorState(remdo.getEditorState());
}
export async function selectEntireNote(remdo: RemdoTestApi, note: NoteRef): Promise<void> {
  // Selects the full text range of a single note.
  await selectNoteTextRange(remdo, note, 0, Number.POSITIVE_INFINITY);
}

export async function selectNoteTextRange(
  remdo: RemdoTestApi,
  note: NoteRef,
  start: number,
  end: number
): Promise<void> {
  // Selects a partial text range of a single note.
  // Limitations: requires a text node in the note; does not simulate pointer selection.
  await placeCaretAtNote(remdo, note);

  await remdo.mutate(() => {
    const selection = $getSelection();
    expect($isRangeSelection(selection)).toBe(true);
    const rangeSelection = selection as ReturnType<typeof $createRangeSelection>;
    const anchorNode = rangeSelection.anchor.getNode();
    expect($isTextNode(anchorNode)).toBe(true);
    const anchorTextNode = anchorNode as TextNode;

    const length = anchorTextNode.getTextContentSize();
    rangeSelection.setTextNodeRange(
      anchorTextNode,
      Math.min(length, start),
      anchorTextNode,
      Math.min(length, end)
    );
  });
}

export async function selectAcrossNoteTextNodes(
  remdo: RemdoTestApi,
  note: NoteRef,
  anchorTextNodeIndex: number,
  anchorOffset: number,
  focusTextNodeIndex: number,
  focusOffset: number
): Promise<void> {
  // Selects a range spanning several text nodes of one note (formatting splits).
  await placeCaretAtNote(remdo, note);

  await remdo.mutate(() => {
    const textNodes = $getNote(note).getChildren().filter($isTextNode);
    const selection = $getSelection();
    expect($isRangeSelection(selection)).toBe(true);

    (selection as ReturnType<typeof $createRangeSelection>).setTextNodeRange(
      textNodes[anchorTextNodeIndex]!,
      anchorOffset,
      textNodes[focusTextNodeIndex]!,
      focusOffset
    );
  });
}

function readFromCaretListItem<T>(remdo: RemdoTestApi, read: (item: ListItemNode) => T): T {
  return remdo.validate(() => {
    const selection = $getSelection();
    expect($isRangeSelection(selection)).toBe(true);
    const rangeSelection = selection as ReturnType<typeof $createRangeSelection>;
    expect(rangeSelection.isCollapsed()).toBe(true);

    const item = findNearestListItem(rangeSelection.anchor.getNode()) ?? findNearestListItem(rangeSelection.focus.getNode())!;

    return read(item);
  });
}

export function readCaretNoteKey(remdo: RemdoTestApi): string {
  // Reads the note key from a collapsed caret selection.
  return readFromCaretListItem(remdo, (item) => item.getKey());
}

export function readCaretNoteId(remdo: RemdoTestApi): string {
  // Reads the note id from a collapsed caret selection.
  return readFromCaretListItem(remdo, (item) => $getNoteIdOrThrow(item, 'Expected caret note to have a noteId'));
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
  start: NoteRef,
  end: NoteRef
): Promise<void> {
  // Creates a Lexical RangeSelection spanning note text (snaps to a note range when it crosses notes).
  // Limitations: requires text nodes in both notes and does not simulate DOM pointer selection.
  if (isSameNote(remdo, start, end)) {
    await selectEntireNote(remdo, start);
    return;
  }

  focusEditorRootElement(remdo);

  await remdo.mutate(() => {
    const startItem = $getNote(start);
    const endItem = $getNote(end);
    const startTextNode = findContentTextNode(startItem);
    const endTextNode = findContentTextNode(endItem);

    expect($isTextNode(startTextNode)).toBe(true);
    expect($isTextNode(endTextNode)).toBe(true);
    const startText = startTextNode as TextNode;
    const endText = endTextNode as TextNode;

    let selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      selection = $createRangeSelection();
      $setSelection(selection);
    }
    const rangeSelection = selection as ReturnType<typeof $createRangeSelection>;
    const startLength = startText.getTextContentSize();
    const endLength = endText.getTextContentSize();

    const order = compareNodeOrder(startItem, endItem);
    if (order <= 0) {
      rangeSelection.setTextNodeRange(startText, 0, endText, endLength);
    } else {
      rangeSelection.setTextNodeRange(startText, startLength, endText, 0);
    }
  });
}
