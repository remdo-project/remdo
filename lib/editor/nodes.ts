import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { ListItemNode, ListNode } from '@lexical/list';

import { ensureNoteIdStateConfig } from './note-id-state';

ensureNoteIdStateConfig();

export const editorNodes: InitialConfigType['nodes'] = [ListNode, ListItemNode];
