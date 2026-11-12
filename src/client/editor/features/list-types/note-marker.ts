import { createState } from 'lexical';
import { patchListItemStateConfig } from '#client/editor/runtime/list-item-state-config';

export type NoteMarker = 'bullet' | 'number' | `number:${number}` | `heading:${1 | 2 | 3 | 4 | 5 | 6}`;

export const markerState = createState('marker', {
  parse: (value): NoteMarker | undefined =>
    typeof value === 'string' && /^(?:bullet|number(?::(?:0|[1-9]\d{0,8}))?|heading:[1-6])$/.test(value)
      ? (value as NoteMarker)
      : undefined,
});

export const checkboxState = createState('checkbox', {
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
}
