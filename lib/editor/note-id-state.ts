import type { ListItemNode } from '@lexical/list';
import { $getState, createState } from 'lexical';
import { patchListItemStateConfig } from './list-item-state-config';

export const noteIdState = createState('noteId', {
  parse: (value) => (typeof value === 'string' ? value : undefined),
});

export function $getNoteId(node: ListItemNode): string | null {
  const noteId = $getState(node, noteIdState);
  return typeof noteId === 'string' && noteId.length > 0 ? noteId : null;
}

let didPatch = false;

export function ensureNoteIdStateConfig(): void {
  if (didPatch) {
    return;
  }
  didPatch = true;
  patchListItemStateConfig(noteIdState);
}

ensureNoteIdStateConfig();
