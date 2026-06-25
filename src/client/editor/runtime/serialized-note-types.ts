import type { SerializedLexicalNode } from 'lexical';
import type { SerializedListItemNode } from '@lexical/list';

import { BodyWrapperNode } from '#client/editor/features/note-body/note-body-node';

export type SerializedNoteListItemNode = SerializedListItemNode & {
  checkState?: boolean;
  noteId?: string;
  folded?: boolean;
  children: SerializedLexicalNode[];
};

// True for a serialized body-wrapper. Its own node type makes this an exact
// type check — the serialized twin of the live `instanceof BodyWrapperNode`.
export function isSerializedBodyWrapper(node: SerializedLexicalNode | null | undefined): boolean {
  return node?.type === BodyWrapperNode.getType();
}
