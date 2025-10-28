import type { InitialConfigType } from 'lexical-vue';
import { ListItemNode, ListNode } from '@lexical/list';

export const editorNodes: InitialConfigType['nodes'] = [ListNode, ListItemNode];
