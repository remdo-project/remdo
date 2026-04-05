import { createEditor } from 'lexical';
import type { CreateEditorArgs, LexicalEditor } from 'lexical';

interface MountedLexicalEditor {
  editor: LexicalEditor;
  root: HTMLDivElement;
  dispose: () => void;
}

export function createMountedLexicalEditor(config: CreateEditorArgs): MountedLexicalEditor {
  const root = document.createElement('div');
  document.body.append(root);

  const editor = createEditor(config);
  editor.setRootElement(root);

  return {
    editor,
    root,
    dispose: () => {
      root.remove();
    },
  };
}
