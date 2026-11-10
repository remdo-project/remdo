import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';
import type { MarkdownNote } from './markdown-outline';

import { formatDateNodeLabel } from '#client/editor/features/date/date-label';
import type { SerializedOutlineNote } from '#client/editor/dev/schema/traverseSerializedOutline';
import { traverseSerializedOutline } from '#client/editor/dev/schema/traverseSerializedOutline';

export interface OutlineNode {
  noteId: string;
  text?: string;
  body?: string;
  folded?: boolean;
  checked?: boolean;
  children?: Outline;
}

export type Outline = OutlineNode[];

function getChildren(node: SerializedLexicalNode | null | undefined): SerializedLexicalNode[] {
  const children = (node as { children?: unknown } | null | undefined)?.children;
  return Array.isArray(children) ? (children as SerializedLexicalNode[]) : [];
}

function collectTextContent(node: SerializedLexicalNode | null | undefined): string {
  if (!node) return '';

  if (node.type === 'date') {
    const isoDate = (node as { isoDate?: unknown }).isoDate;
    return typeof isoDate === 'string' ? formatDateNodeLabel(isoDate) : '';
  }

  // Mirror Lexical's LineBreakNode.getTextContent(), which yields '\n'.
  if (node.type === 'linebreak') {
    return '\n';
  }

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

  const { notes, valid } = traverseSerializedOutline(state as SerializedEditorState);
  if (!valid) {
    throw new TypeError('Expected outline to be valid.');
  }

  const readNotes = (items: SerializedOutlineNote[]): Outline =>
    items.map((note) => {
      const text = note.contentNodes.length > 0 ? note.contentNodes.map(collectTextContent).join('') : null;
      const node: OutlineNode = { noteId: note.noteId };
      if (text !== null) {
        node.text = text;
      }
      if (note.bodyNodes !== undefined) {
        node.body = note.bodyNodes.map(collectTextContent).join('');
      }
      if (note.folded === true) {
        node.folded = true;
      }
      if (note.checked === true) {
        node.checked = true;
      }
      if (note.children.length > 0) {
        node.children = readNotes(note.children);
      }
      return node;
    });

  return readNotes(notes);
}

export function flattenOutline(outline: Outline): OutlineNode[] {
  const flattened: OutlineNode[] = [];
  const walk = (nodes: Outline) => {
    for (const node of nodes) {
      flattened.push(node);
      if (node.children) {
        walk(node.children);
      }
    }
  };
  walk(outline);
  return flattened;
}

export function collectOutlineNoteIds(outline: Outline): string[] {
  return flattenOutline(outline).map((node) => node.noteId);
}

/** The editor's outline in the shape a Markdown expectation has, with IDs only where it declares one. */
export function projectOutline(actual: Outline, expected: MarkdownNote[] | undefined): MarkdownNote[] {
  return actual.map((node, index) => {
    const declared = expected?.[index];
    const projected: MarkdownNote = {};
    if (node.text) projected.text = node.text;
    if (node.checked) projected.checked = true;
    if (declared?.id !== undefined) projected.id = node.noteId;
    if (node.body !== undefined) projected.body = node.body;
    if (node.folded) projected.folded = true;
    if (node.children) projected.children = projectOutline(node.children, declared?.children);
    return projected;
  });
}
