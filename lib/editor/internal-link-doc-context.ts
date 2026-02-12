import { $getEditor } from 'lexical';
import type { LexicalEditor } from 'lexical';

const internalLinkDocContextByEditor = new WeakMap<LexicalEditor, string>();

export function setInternalLinkDocContext(editor: LexicalEditor, docId: string): void {
  internalLinkDocContextByEditor.set(editor, docId);
}

export function clearInternalLinkDocContext(editor: LexicalEditor): void {
  internalLinkDocContextByEditor.delete(editor);
}

export function $requireInternalLinkDocContext(): string {
  const editor = $getEditor();
  const docId = internalLinkDocContextByEditor.get(editor);
  if (!docId) {
    throw new Error('Internal link doc context is required for same-document link resolution.');
  }
  return docId;
}
