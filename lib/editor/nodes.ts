import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { ListItemNode, ListNode } from '@lexical/list';
import { NoteListItemNode } from '@/editor/nodes/NoteListItemNode';

export const editorNodes: InitialConfigType['nodes'] = [
  ListNode,
  {
    replace: NoteListItemNode,
    with: (node: ListItemNode) => new NoteListItemNode(node.getValue(), node.getChecked()),
    withKlass: NoteListItemNode,
  },
];
