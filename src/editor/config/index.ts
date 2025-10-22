import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { useMemo } from 'react';
import { onError } from './error-handler';
import { editorNodes } from './nodes';
import { editorTheme } from './theme';

interface EditorConfigResult {
  initialConfig: InitialConfigType;
  dev: boolean;
}

export function useEditorConfig(): EditorConfigResult {
  const initialConfig = useMemo(
    () => ({
      namespace: 'lexical-basic-rich-text',
      theme: editorTheme,
      nodes: editorNodes,
      onError,
      editorState: null,
    }),
    []
  );

  return {
    initialConfig,
    dev: import.meta.env.DEV,
  };
}

export default useEditorConfig;
