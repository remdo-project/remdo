import type { SerializedLexicalNode } from 'lexical';
import type { SerializedListItemNode } from '@lexical/list';

export type SerializedNoteListItemNode = SerializedListItemNode & {
  checkState?: boolean;
  noteId?: string;
  folded?: boolean;
  children: SerializedLexicalNode[];
};
