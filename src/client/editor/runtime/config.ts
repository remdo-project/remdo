import type { CreateEditorArgs } from 'lexical';
import { defineExtension } from 'lexical';
import { config } from '#config';
import { editorNodes } from './nodes';
import { editorTheme } from './theme';

export const editorConfig = {
  namespace: 'lexical-basic-rich-text',
  theme: editorTheme,
  nodes: editorNodes,
  onError(error) {
    if (config.isDevOrTest) {
      throw error;
    }

    console.error('runtime.editor-error');
  },
} satisfies CreateEditorArgs;

export const editorExtension = defineExtension({
  name: 'remdo-editor',
  ...editorConfig,
});
