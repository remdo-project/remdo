import type { SerializedLexicalNode } from 'lexical';
import type { SerializedListItemNode } from '@lexical/list';

import { NoteBodyNode } from '#client/editor/features/note-body/note-body-node';

export type SerializedNoteListItemNode = SerializedListItemNode & {
  checkState?: boolean;
  noteId?: string;
  folded?: boolean;
  children: SerializedLexicalNode[];
};

const SERIALIZED_LIST_ITEM_TYPE = 'listitem';

type SerializedNodeWithChildren = SerializedLexicalNode & { children?: SerializedLexicalNode[] };

// True for a serialized body-wrapper: a list item whose single child is a note
// body. The serialized twin of the live `isBodyWrapper` — both express the same
// structural invariant, so this is the single place the serialized shape lives.
export function isSerializedBodyWrapper(node: SerializedLexicalNode | null | undefined): boolean {
  if (node?.type !== SERIALIZED_LIST_ITEM_TYPE) {
    return false;
  }
  const children = (node as SerializedNodeWithChildren).children;
  return Array.isArray(children) && children.length === 1 && children[0]?.type === NoteBodyNode.getType();
}
