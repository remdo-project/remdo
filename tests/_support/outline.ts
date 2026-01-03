import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import type { SerializedOutlineNote } from '@/editor/plugins/dev/schema/traverseSerializedOutlineOrThrow';
import { traverseSerializedOutlineOrThrow } from '@/editor/plugins/dev/schema/traverseSerializedOutlineOrThrow';

export interface OutlineNode {
  noteId: string | null;
  text?: string;
  children?: Outline;
}

export type Outline = OutlineNode[];

export function getNoteAtPath(outline: Outline, path: number[]): OutlineNode {
  let current: Outline = outline;
  let node: OutlineNode | undefined;

  for (const index of path) {
    node = current[index];
    if (!node) {
      throw new Error(`Outline path "${path.join('.')}" does not exist.`);
    }
    current = node.children ?? [];
  }

  if (!node) {
    throw new Error(`Outline path "${path.join('.')}" does not exist.`);
  }

  return node;
}

export function getNoteIdAtPath(outline: Outline, path: number[]): string {
  const node = getNoteAtPath(outline, path);
  if (!node.noteId) {
    throw new Error(`Expected noteId at outline path "${path.join('.')}".`);
  }
  return node.noteId;
}

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
      if (typeof note.noteId !== 'string' || note.noteId.length === 0) {
        throw new TypeError(`Expected noteId to be a non-empty string at "${note.path.join('.')}".`);
      }
      const node: OutlineNode = { noteId: note.noteId };
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

export function mutateOutlineNoteIdWildcards(actual: Outline, expected: Outline): void {
  // Normalize actuals before comparison so we keep vitest's diff output while still allowing
  // `noteId: null` in expected outlines to mean "present but don't care about the value", and so
  // the same helper works for vitest and playwright expectations.
  const walk = (actualNodes: Outline, expectedNodes: Outline) => {
    for (let index = 0; index < actualNodes.length; index += 1) {
      const actualNode = actualNodes[index]!;
      const expectedNode = expectedNodes[index];
      if (expectedNode?.noteId === null) {
        actualNode.noteId = null;
      }
      if (actualNode.children) {
        walk(actualNode.children, expectedNode?.children ?? []);
      }
    }
  };

  walk(actual, expected);
}
