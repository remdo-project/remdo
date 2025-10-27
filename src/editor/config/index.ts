import type { InitialConfigType } from 'lexical-vue/LexicalComposer';
import { computed } from 'vue';
import { onError } from './error-handler';
import { editorNodes } from './nodes';
import { editorTheme } from './theme';

const initialConfigValue = computed<InitialConfigType>(() => ({
  namespace: 'lexical-basic-rich-text',
  theme: editorTheme,
  nodes: editorNodes,
  onError,
  editorState: null,
}));

export function useEditorConfig() {
  return {
    initialConfig: initialConfigValue,
  };
}

export type { InitialConfigType };
