import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import type { SerializedOutlineNote } from '@/editor/plugins/dev/schema/traverseSerializedOutlineOrThrow';
import { traverseSerializedOutlineOrThrow } from '@/editor/plugins/dev/schema/traverseSerializedOutlineOrThrow';

export interface OutlineNode {
  text?: string;
  children?: Outline;
}

export type Outline = OutlineNode[];

function getChildren(node: SerializedLexicalNode | null | undefined): SerializedLexicalNode[] {
  const children = (node as { children?: unknown } | null | undefined)?.children;
  return Array.isArray(children) ? (children as SerializedLexicalNode[]) : [];
}

function collectTextContent(node: SerializedLexicalNode | null | undefined): string {
  if (!node) return '';

  const maybeText: unknown = (node as { text?: unknown }).text;
  const text = typeof maybeText === 'string' ? maybeText : '';
  const childrenText = getChildren(node).map(collectTextContent).join('');

  return text + childrenText;
}

export function extractOutlineFromEditorState(state: unknown): Outline {
  const root = (state as SerializedEditorState | null | undefined)?.root;
  if (!root || root.type !== 'root') {
    throw new TypeError('Expected a Lexical SerializedEditorState with root.type === "root".');
  }

  const notes = traverseSerializedOutlineOrThrow(state as SerializedEditorState);

  const readNotes = (items: SerializedOutlineNote[]): Outline =>
    items.map((note) => {
      const text = note.contentNodes.length > 0 ? note.contentNodes.map(collectTextContent).join('') : null;
      const node: OutlineNode = {};
      if (text !== null) {
        node.text = text;
      }
      if (note.children.length > 0) {
        node.children = readNotes(note.children);
      }
      return node;
    });

  return readNotes(notes);
}
