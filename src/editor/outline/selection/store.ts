import type { LexicalEditor } from 'lexical';
import type { OutlineSelection } from './model';

const outlineSelectionStore = new WeakMap<LexicalEditor, OutlineSelection | null>();

export interface OutlineSelectionApi {
  get: () => OutlineSelection | null;
  set: (selection: OutlineSelection | null) => void;
  heads: () => string[];
  isStructural: () => boolean;
}

export function installOutlineSelectionHelpers(editor: LexicalEditor): void {
  editor.selection ??= {
    get: () => outlineSelectionStore.get(editor) ?? null,
    set: (selection) => {
      outlineSelectionStore.set(editor, selection);
    },
    heads: () => outlineSelectionStore.get(editor)?.headKeys ?? [],
    isStructural: () => outlineSelectionStore.get(editor)?.kind === 'structural',
  };
}
