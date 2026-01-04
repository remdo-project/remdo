import type { SerializedListNode } from '@lexical/list';
import type { SerializedNoteListItemNode } from '#lib/editor/serialized-note-types';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import type { SerializedLexicalNode } from 'lexical';

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

export function createDataTransfer(payload: unknown): DataTransfer {
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

  transfer.setData('application/x-lexical-editor', JSON.stringify(payload));
  return transfer;
}

export function createClipboardEvent(
  payload: unknown,
  type: 'paste' | 'cut' | 'copy' = 'paste'
): ClipboardEvent {
  return new ClipboardEvent(type, {
    clipboardData: createDataTransfer(payload),
  });
}

export function buildClipboardPayload(remdo: RemdoTestApi, noteIds: string[]) {
  const state = remdo.getEditorState();
  const listNode = getListNode(state);
  const listChildren = listNode.children as SerializedNoteListItemNode[];
  const selectedItems = listChildren.filter((child) => {
    return typeof child.noteId === 'string' && noteIds.includes(child.noteId);
  });

  if (selectedItems.length !== noteIds.length) {
    throw new Error(`Expected to find ${noteIds.length} list items for clipboard payload.`);
  }

  return {
    namespace: (remdo.editor as { _config?: { namespace?: string } })._config?.namespace ?? 'remdo',
    nodes: [{ ...listNode, children: selectedItems }],
  };
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
