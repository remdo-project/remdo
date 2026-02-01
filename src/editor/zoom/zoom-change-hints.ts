import type { LexicalEditor } from 'lexical';

const zoomMergeHint = new WeakMap<LexicalEditor, string | null>();

export function setZoomMergeHint(editor: LexicalEditor, noteId: string | null): void {
  zoomMergeHint.set(editor, noteId);
}

export function consumeZoomMergeHint(editor: LexicalEditor): { noteId: string | null } | null {
  if (!zoomMergeHint.has(editor)) {
    return null;
  }
  const hint = zoomMergeHint.get(editor) ?? null;
  zoomMergeHint.delete(editor);
  return { noteId: hint };
}
