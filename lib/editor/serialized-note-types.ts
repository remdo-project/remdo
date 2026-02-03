import type { SerializedLexicalNode } from 'lexical';
import type { SerializedListItemNode } from '@lexical/list';

export type SerializedNoteListItemNode = SerializedListItemNode & {
  noteId?: string;
  folded?: boolean;
  children: SerializedLexicalNode[];
};
