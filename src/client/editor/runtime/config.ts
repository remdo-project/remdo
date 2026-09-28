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
    // Browsers hand it to the global error handlers, which report it; the
    // headless editor runs where this hook does not exist.
    if (typeof globalThis.reportError === 'function') {
      globalThis.reportError(error);
      return;
    }

    console.error('runtime.editor-error');
  },
} satisfies CreateEditorArgs;

export const editorExtension = defineExtension({
  name: 'remdo-editor',
  ...editorConfig,
});
