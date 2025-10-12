import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { ListItemNode, ListNode } from '@lexical/list';

export const editorNodes: InitialConfigType['nodes'] = [ListNode, ListItemNode];
