import { createCommand } from 'lexical';

export const REORDER_NOTES_UP_COMMAND = createCommand<undefined>('remdo:reorder-notes-up');
export const REORDER_NOTES_DOWN_COMMAND = createCommand<undefined>('remdo:reorder-notes-down');
export type NoteCheckedState = 'checked' | 'unchecked' | 'toggle';
export interface SetNoteCheckedPayload {
  state: NoteCheckedState;
  noteKey?: string;
}
export const SET_NOTE_CHECKED_COMMAND = createCommand<SetNoteCheckedPayload>('remdo:set-note-checked');
type NoteFoldState = 'folded' | 'unfolded' | 'toggle';
interface SetNoteFoldPayload {
  state: NoteFoldState;
  noteKey: string;
}
export const SET_NOTE_FOLD_COMMAND = createCommand<SetNoteFoldPayload>('remdo:set-note-fold');
export const OPEN_NOTE_MENU_COMMAND = createCommand<{
  noteKey: string;
  anchor?: { left: number; top: number };
}>('remdo:open-note-menu');
export const ZOOM_TO_NOTE_COMMAND = createCommand<{ noteId: string }>('remdo:zoom-to-note');
export const COLLAPSE_STRUCTURAL_SELECTION_COMMAND = createCommand<{
  edge?: 'start' | 'end' | 'anchor';
}>('selection:collapse-structural');
export const PROGRESSIVE_SELECTION_DIRECTION_COMMAND = createCommand<{
  direction: 'up' | 'down';
}>('selection:progressive-direction');
