import type { ListItemNode } from '@lexical/list';
import { $getState, $setState, createState } from 'lexical';
import { patchListItemStateConfig } from './list-item-state-config';

const checklistState = createState('checkState', {
  parse: (value) => (value === true ? true : undefined),
});

export function $getNoteChecked(node: ListItemNode): boolean | undefined {
  return $getState(node, checklistState);
}

// Low-level storage primitive only: writes a single node's persisted checkState.
// This does not apply recursive subtree semantics.
export function $setNoteCheckedRaw(node: ListItemNode, value: boolean | undefined): void {
  $setState(node, checklistState, value === true ? true : checklistState.parse(null));
}

let didPatch = false;

function ensureChecklistStateConfig(): void {
  if (didPatch) {
    return;
  }
  didPatch = true;
  patchListItemStateConfig(checklistState);
}

ensureChecklistStateConfig();
