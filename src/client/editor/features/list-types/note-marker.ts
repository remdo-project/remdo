import { $isListNode } from '@lexical/list';
import type { ListItemNode } from '@lexical/list';
import { $getState, createState } from 'lexical';
import { patchListItemStateConfig } from '#client/editor/runtime/list-item-state-config';
import { $getNoteChecked } from './checked-state';

export const markerState = createState('marker', {
  parse: (value) =>
    typeof value === 'string' && /^(?:bullet|block|number(?::(?:0|[1-9]\d{0,8}))?|heading:[1-6])$/.test(value)
      ? value
      : undefined,
});

export const checkboxState = createState('checkbox', {
  parse: (value) => (value === true ? true : undefined),
});

export const verbatimState = createState('verbatim', {
  parse: (value) => (value === true ? true : undefined),
});

let didPatch = false;

export function ensureNoteMarkerStateConfig(): void {
  if (didPatch) {
    return;
  }
  didPatch = true;
  patchListItemStateConfig(markerState);
  patchListItemStateConfig(checkboxState);
  patchListItemStateConfig(verbatimState);
}

// Editor documents keep a list's type on the list until they move to the text format, so a note
// without a marker of its own follows its list.
export function $getNoteMarker(note: ListItemNode): string {
  const stored = $getState(note, markerState);
  if (stored !== undefined) {
    return stored;
  }
  const list = note.getParent();
  return $isListNode(list) && list.getListType() === 'number' ? 'number' : 'bullet';
}

export function $hasNoteCheckbox(note: ListItemNode): boolean {
  if ($getState(note, checkboxState) === true || $getNoteChecked(note) === true) {
    return true;
  }
  const list = note.getParent();
  return $isListNode(list) && list.getListType() === 'check';
}
