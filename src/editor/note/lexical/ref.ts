import type {LexicalEditor, NodeKey} from 'lexical';

import {indentNote, reorderNote} from './helpers';

export function note(editor: LexicalEditor, key: NodeKey) {
  return {
    indent(): void {
      indentNote(editor, key);
    },
    reorderUp(): void {
      reorderNote(editor, key, 'up');
    },
    reorderDown(): void {
      reorderNote(editor, key, 'down');
    },
  };
}

