import type { LexicalEditor } from 'lexical';

const selectionBoundaryStore = new WeakMap<LexicalEditor, string | null>();

export function setSelectionBoundary(editor: LexicalEditor, key: string | null): void {
  selectionBoundaryStore.set(editor, key);
}

export function getSelectionBoundary(editor: LexicalEditor): string | null {
  return selectionBoundaryStore.get(editor) ?? null;
}
