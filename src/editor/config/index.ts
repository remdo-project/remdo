import type { InitialConfigType } from 'lexical-vue';
import { onError } from './error-handler';
import { editorNodes } from './nodes';
import { editorTheme } from './theme';

interface EditorConfigResult {
  initialConfig: InitialConfigType;
}

const initialConfig: InitialConfigType = {
  namespace: 'lexical-basic-rich-text',
  theme: editorTheme,
  nodes: editorNodes,
  onError,
  editorState: null,
};

export function useEditorConfig(): EditorConfigResult {
  return {
    initialConfig,
  };
}

export default useEditorConfig;
