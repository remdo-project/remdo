import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { defineExtension } from 'lexical';
import { config } from '#config';
import { editorNodes } from './nodes';
import { editorTheme } from './theme';

export function createEditorInitialConfig(): InitialConfigType {
  return {
    namespace: 'lexical-basic-rich-text',
    theme: editorTheme,
    nodes: editorNodes,
    onError(error) {
      if (config.isDevOrTest) {
        throw error;
      }

      console.error('runtime.editor-error');
    },
  };
}

export const editorExtension = defineExtension({
  name: 'remdo-editor',
  ...createEditorInitialConfig(),
});
