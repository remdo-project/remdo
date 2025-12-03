import { createCommand } from 'lexical';

export const MOVE_SELECTION_UP_COMMAND = createCommand<undefined>('remdo:move-selection-up');
export const MOVE_SELECTION_DOWN_COMMAND = createCommand<undefined>('remdo:move-selection-down');

