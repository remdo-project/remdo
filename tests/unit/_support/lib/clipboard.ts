import type { SerializedListNode } from '@lexical/list';
import type { SerializedNoteListItemNode } from '#lib/editor/serialized-note-types';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import type { SerializedLexicalNode } from 'lexical';
import { COPY_COMMAND, CUT_COMMAND, PASTE_COMMAND } from 'lexical';
import { findSerializedNode, getSerializedNodeChildren } from './serialized';

function getListNode(state: RemdoTestApi['getEditorState'] extends () => infer R ? R : never): SerializedListNode {
  const root = (state as { root?: { children?: unknown } }).root;
  const children = root && Array.isArray(root.children) ? root.children : [];
  const listNode = children.find(
    (child): child is SerializedListNode =>
      typeof child === 'object' &&
      child !== null &&
      (child as { type?: unknown }).type === 'list' &&
      Array.isArray((child as { children?: unknown }).children)
  );
  return listNode as SerializedListNode;
}

export function createDataTransfer(payload?: unknown): DataTransfer {
  const data = new Map<string, string>();
  const transfer = {
    getData(type: string) {
      return data.get(type) ?? '';
    },
    setData(type: string, value: string) {
      data.set(type, value);
    },
    files: [] as File[],
    get types() {
      return Array.from(data.keys());
    },
  } as unknown as DataTransfer;

  if (payload !== undefined) {
    transfer.setData('application/x-lexical-editor', JSON.stringify(payload));
  }
  return transfer;
}

function createClipboardEvent(
  payload?: unknown,
  type: 'paste' | 'cut' | 'copy' = 'paste'
): ClipboardEvent {
  return new ClipboardEvent(type, {
    clipboardData: createDataTransfer(payload),
  });
}

function findSerializedListItem(node: SerializedLexicalNode, noteId: string): SerializedNoteListItemNode | null {
  return findSerializedNode([node], (candidate): candidate is SerializedNoteListItemNode => (
    candidate.type === 'listitem' && (candidate as SerializedNoteListItemNode).noteId === noteId
  ));
}

export function buildClipboardPayload(remdo: RemdoTestApi, noteIds: string[]) {
  const listNode = getListNode(remdo.getEditorState()) as SerializedLexicalNode;
  const selectedItems: SerializedNoteListItemNode[] = [];

  for (const noteId of noteIds) {
    const match = findSerializedListItem(listNode, noteId)!;
    selectedItems.push(match);
  }

  return {
    namespace: (remdo.editor as { _config?: { namespace?: string } })._config?.namespace ?? 'remdo',
    nodes: [{ ...(listNode as SerializedListNode), children: selectedItems }],
  };
}

function readClipboardPayload(clipboardEvent: ClipboardEvent, label: string) {
  const rawPayload = clipboardEvent.clipboardData?.getData('application/x-lexical-editor') ?? '';
  if (!rawPayload) {
    throw new TypeError(`Expected ${label} to populate clipboard payload.`);
  }
  return JSON.parse(rawPayload) as { namespace?: string; nodes?: unknown[] };
}

// CUT_COMMAND only marks a structural selection for move; this helper reads
// the payload the cut handler writes to the clipboard so paste stays realistic.
// Limitation: structural cut collapses the selection onto the cut note; in
// collab tests, relocate the caret before a remote delete of that note to
// avoid Lexical/Yjs "node does not exist" errors.
export async function cutSelection(remdo: RemdoTestApi) {
  const clipboardEvent = createClipboardEvent(undefined, 'cut');
  await remdo.dispatchCommand(CUT_COMMAND, clipboardEvent, { expect: 'update' });
  return readClipboardPayload(clipboardEvent, 'cut');
}

export async function copySelection(remdo: RemdoTestApi) {
  const clipboardEvent = createClipboardEvent(undefined, 'copy');
  await remdo.dispatchCommand(COPY_COMMAND, clipboardEvent, { expect: 'any' });
  return readClipboardPayload(clipboardEvent, 'copy');
}

export async function pastePayload(remdo: RemdoTestApi, payload: unknown) {
  await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(payload));
}

function normalizeIndent(node: SerializedLexicalNode): void {
  if ('indent' in node && typeof node.indent === 'number') {
    node.indent = 0;
  }
  for (const child of getSerializedNodeChildren(node)) {
    normalizeIndent(child);
  }
}

export function buildCustomClipboardPayload(remdo: RemdoTestApi, children: SerializedNoteListItemNode[]) {
  for (const child of children) {
    normalizeIndent(child);
  }

  const listNode = getListNode(remdo.getEditorState());
  return {
    namespace: (remdo.editor as { _config?: { namespace?: string } })._config?.namespace ?? 'remdo',
    nodes: [{ ...listNode, children }],
  };
}

export function getSerializedRootListNode(remdo: RemdoTestApi): SerializedListNode {
  return getListNode(remdo.getEditorState());
}
