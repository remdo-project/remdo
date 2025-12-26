import type { LexicalEditor } from 'lexical';
import type { OutlineSelection } from './model';

const outlineSelectionStore = new WeakMap<LexicalEditor, OutlineSelection | null>();

export function installOutlineSelectionHelpers(editor: LexicalEditor): void {
  editor.getOutlineSelection ??= () => outlineSelectionStore.get(editor) ?? null;
  editor.setOutlineSelection ??= (selection) => {
    outlineSelectionStore.set(editor, selection);
  };
}
