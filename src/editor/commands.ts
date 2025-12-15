import { createCommand } from 'lexical';

export const REORDER_NOTES_UP_COMMAND = createCommand<undefined>('remdo:reorder-notes-up');
export const REORDER_NOTES_DOWN_COMMAND = createCommand<undefined>('remdo:reorder-notes-down');
