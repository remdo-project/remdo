import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { editorNodes } from './nodes';
import { editorTheme } from './theme';

interface EditorConfigOptions {
  isDev: boolean;
}

export function createEditorInitialConfig({ isDev }: EditorConfigOptions): InitialConfigType {
  return {
    namespace: 'lexical-basic-rich-text',
    theme: editorTheme,
    nodes: editorNodes,
    onError(error) {
      if (isDev) {
        throw error;
      }

      console.error(error);
    },
  };
}
