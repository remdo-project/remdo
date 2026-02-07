import type { ListItemNode } from '@lexical/list';
import { $getState, $setState, createState } from 'lexical';
import { patchListItemStateConfig } from './list-item-state-config';

export const checklistState = createState('checkState', {
  parse: (value) => (typeof value === 'boolean' ? value : undefined),
});

export function $getNoteChecked(node: ListItemNode): boolean | undefined {
  return $getState(node, checklistState);
}

export function $setNoteChecked(node: ListItemNode, value: boolean | undefined): void {
  $setState(node, checklistState, value);
}

export function $toggleNoteChecked(node: ListItemNode): void {
  const current = $getState(node, checklistState);
  $setState(node, checklistState, current === undefined ? true : !current);
}

let didPatch = false;

export function ensureChecklistStateConfig(): void {
  if (didPatch) {
    return;
  }
  didPatch = true;
  patchListItemStateConfig(checklistState);
}

ensureChecklistStateConfig();
