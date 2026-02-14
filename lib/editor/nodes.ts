import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';

import { ensureFoldStateConfig } from './fold-state';
import { NoteLinkNode } from './note-link-node';
import { ensureNoteIdStateConfig } from './note-id-state';

ensureNoteIdStateConfig();
ensureFoldStateConfig();

export const editorNodes: InitialConfigType['nodes'] = [ListNode, ListItemNode, LinkNode, NoteLinkNode];
