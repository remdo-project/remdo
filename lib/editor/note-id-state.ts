import type { ListItemNode } from '@lexical/list';
import { $getState, createState } from 'lexical';
import { patchListItemStateConfig } from './list-item-state-config';
import { normalizeNoteId } from './note-ids';

export const noteIdState = createState('noteId', {
  parse: (value) => normalizeNoteId(value) ?? undefined,
});

export function $getNoteId(node: ListItemNode): string | null {
  const noteId = $getState(node, noteIdState);
  return normalizeNoteId(noteId);
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
