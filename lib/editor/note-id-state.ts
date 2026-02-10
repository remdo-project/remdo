import type { ListItemNode } from '@lexical/list';
import { $getState, $isRootNode, $setState, RootNode, createState } from 'lexical';
import { patchListItemStateConfig } from './list-item-state-config';

export const noteIdState = createState('noteId', {
  parse: (value) => (typeof value === 'string' ? value : undefined),
});

type RootNodeWithNoteId = RootNode & { __noteId?: string };

function normalizeNoteId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function $getNoteId(node: ListItemNode | RootNode): string | null {
  if ($isRootNode(node)) {
    return normalizeNoteId((node as RootNodeWithNoteId).__noteId);
  }
  const noteId = $getState(node, noteIdState);
  return normalizeNoteId(noteId);
}

export function $setNoteId(node: ListItemNode | RootNode, noteId: string | undefined): void {
  const normalized = normalizeNoteId(noteId) ?? undefined;
  if ($isRootNode(node)) {
    const writable = node.getWritable() as RootNodeWithNoteId;
    writable.__noteId = normalized;
    return;
  }
  $setState(node, noteIdState, normalized);
}

function patchRootNoteIdSerialization(): void {
  const rootProto = RootNode.prototype as any;

  const originalAfterCloneFrom = rootProto.afterCloneFrom as (prevNode: RootNode) => void;
  rootProto.afterCloneFrom = function patchedAfterCloneFrom(this: RootNodeWithNoteId, prevNode: RootNode) {
    originalAfterCloneFrom.call(this, prevNode);
    this.__noteId = normalizeNoteId((prevNode as RootNodeWithNoteId).__noteId) ?? undefined;
  };

  const originalExportJSON = rootProto.exportJSON as () => Record<string, unknown>;
  rootProto.exportJSON = function patchedExportJSON(this: RootNodeWithNoteId) {
    const serialized = originalExportJSON.call(this);
    const noteId = normalizeNoteId(this.__noteId);
    if (noteId) {
      serialized.noteId = noteId;
    }
    return serialized;
  };

  const originalUpdateFromJSON = rootProto.updateFromJSON as (serializedNode: unknown) => RootNode;
  rootProto.updateFromJSON = function patchedUpdateFromJSON(
    this: RootNodeWithNoteId,
    serializedNode: unknown
  ) {
    const updated = originalUpdateFromJSON.call(this, serializedNode);
    const writable = updated.getWritable() as RootNodeWithNoteId;
    writable.__noteId = normalizeNoteId((serializedNode as { noteId?: unknown }).noteId) ?? undefined;
    return updated;
  };
}

let didPatch = false;

export function ensureNoteIdStateConfig(): void {
  if (didPatch) {
    return;
  }
  didPatch = true;
  patchListItemStateConfig(noteIdState);
  patchRootNoteIdSerialization();
}

ensureNoteIdStateConfig();
