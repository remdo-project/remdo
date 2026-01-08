import type { SerializedListNode } from '@lexical/list';
import type { SerializedNoteListItemNode } from '#lib/editor/serialized-note-types';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import type { SerializedLexicalNode } from 'lexical';
import { CUT_COMMAND } from 'lexical';
import { selectStructuralNotesById } from './dom-selection';

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
  if (!listNode) {
    throw new Error('Expected a list node with children for clipboard payload.');
  }
  return listNode;
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

export function createClipboardEvent(
  payload?: unknown,
  type: 'paste' | 'cut' | 'copy' = 'paste'
): ClipboardEvent {
  return new ClipboardEvent(type, {
    clipboardData: createDataTransfer(payload),
  });
}

function findSerializedListItem(node: SerializedLexicalNode, noteId: string): SerializedNoteListItemNode | null {
  if (node.type === 'listitem') {
    const listItem = node as SerializedNoteListItemNode;
    if (listItem.noteId === noteId) {
      return listItem;
    }
  }

  if ('children' in node && Array.isArray((node as { children?: SerializedLexicalNode[] }).children)) {
    for (const child of (node as { children: SerializedLexicalNode[] }).children) {
      const found = findSerializedListItem(child, noteId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

export function buildClipboardPayload(remdo: RemdoTestApi, noteIds: string[]) {
  const listNode = getListNode(remdo.getEditorState()) as SerializedLexicalNode;
  const selectedItems: SerializedNoteListItemNode[] = [];

  for (const noteId of noteIds) {
    const match = findSerializedListItem(listNode, noteId);
    if (!match) {
      throw new Error(`Expected to find list item for noteId "${noteId}" in clipboard payload.`);
    }
    selectedItems.push(match);
  }

  return {
    namespace: (remdo.editor as { _config?: { namespace?: string } })._config?.namespace ?? 'remdo',
    nodes: [{ ...(listNode as SerializedListNode), children: selectedItems }],
  };
}

// CUT_COMMAND only marks a structural selection for move; this helper reads
// the payload the cut handler writes to the clipboard so paste stays realistic.
export async function cutStructuralNoteById(remdo: RemdoTestApi, noteId: string) {
  await selectStructuralNotesById(remdo, noteId);
  const clipboardEvent = createClipboardEvent(undefined, 'cut');
  await remdo.dispatchCommand(CUT_COMMAND, clipboardEvent, { expect: 'update' });

  const rawPayload = clipboardEvent.clipboardData?.getData('application/x-lexical-editor') ?? '';
  if (!rawPayload) {
    throw new Error('Expected cut to populate clipboard payload.');
  }
  return JSON.parse(rawPayload) as { namespace?: string; nodes?: unknown[] };
}

function normalizeIndent(node: SerializedLexicalNode): void {
  if ('indent' in node && typeof node.indent === 'number') {
    node.indent = 0;
  }
  if ('children' in node && Array.isArray((node as { children?: SerializedLexicalNode[] }).children)) {
    for (const child of (node as { children: SerializedLexicalNode[] }).children) {
      normalizeIndent(child);
    }
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
