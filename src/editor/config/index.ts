import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { useMemo } from 'react';
import { onError } from './error-handler';
import { editorNodes } from './nodes';
import { editorTheme } from './theme';

interface EditorConfigResult {
  initialConfig: InitialConfigType;
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
  };
}

export default useEditorConfig;
