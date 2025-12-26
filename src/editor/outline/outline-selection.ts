import type { LexicalEditor } from 'lexical';

export type OutlineSelectionKind = 'caret' | 'inline' | 'structural';

export interface OutlineSelectionRange {
  caretStartKey: string;
  caretEndKey: string;
  visualStartKey: string;
  visualEndKey: string;
}

export interface OutlineSelection {
  kind: OutlineSelectionKind;
  stage: number;
  anchorKey: string | null;
  focusKey: string | null;
  headKeys: string[];
  range: OutlineSelectionRange | null;
  isBackward: boolean;
}

const outlineSelectionStore = new WeakMap<LexicalEditor, OutlineSelection | null>();

export function installOutlineSelectionHelpers(editor: LexicalEditor): void {
  editor.getOutlineSelection ??= () => outlineSelectionStore.get(editor) ?? null;
  editor.setOutlineSelection ??= (selection) => {
    outlineSelectionStore.set(editor, selection);
  };
}
