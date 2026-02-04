import { createCommand } from 'lexical';

export const REORDER_NOTES_UP_COMMAND = createCommand<undefined>('remdo:reorder-notes-up');
export const REORDER_NOTES_DOWN_COMMAND = createCommand<undefined>('remdo:reorder-notes-down');
export const TOGGLE_NOTE_FOLD_COMMAND = createCommand<{ noteKey: string }>('remdo:toggle-note-fold');
export const OPEN_NOTE_MENU_COMMAND = createCommand<{ noteKey: string }>('remdo:open-note-menu');
export const ZOOM_TO_NOTE_COMMAND = createCommand<{ noteId: string }>('remdo:zoom-to-note');
export const COLLAPSE_STRUCTURAL_SELECTION_COMMAND = createCommand<{
  edge?: 'start' | 'end' | 'anchor';
}>('selection:collapse-structural');
export const PROGRESSIVE_SELECTION_DIRECTION_COMMAND = createCommand<{
  direction: 'up' | 'down';
}>('selection:progressive-direction');
