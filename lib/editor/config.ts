import type { InitialConfigType } from '@lexical/react/LexicalComposer';
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

      console.error(error);
    },
  };
}
