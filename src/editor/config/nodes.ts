import type { InitialConfigType } from 'lexical-vue/LexicalComposer';
import { ListItemNode, ListNode } from '@lexical/list';

export const editorNodes: InitialConfigType['nodes'] = [ListNode, ListItemNode];
