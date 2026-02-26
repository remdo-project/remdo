import type { LexicalEditor } from 'lexical';
import type { OutlineSelection } from './model';

const outlineSelectionStore = new WeakMap<LexicalEditor, OutlineSelection | null>();

export interface OutlineSelectionApi {
  get: () => OutlineSelection | null;
  set: (selection: OutlineSelection | null) => void;
  isStructural: () => boolean;
}

export function installOutlineSelectionHelpers(editor: LexicalEditor): void {
  // Avoid clobbering an existing selection API; rely on a runtime own-property check.
  const hasSelection = Object.prototype.hasOwnProperty.call(editor as unknown as Record<string, unknown>, 'selection');
  if (hasSelection) {
    return;
  }

  editor.selection = {
    get: () => outlineSelectionStore.get(editor) ?? null,
    set: (selection) => {
      outlineSelectionStore.set(editor, selection);
    },
    isStructural: () => outlineSelectionStore.get(editor)?.kind === 'structural',
  };
}
