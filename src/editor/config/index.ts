import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { useMemo } from 'react';
import { onError } from './error-handler';
import { seedInitialState } from './initial-state';
import { editorNodes } from './nodes';
import { editorTheme } from './theme';

export function useEditorConfig(): InitialConfigType {
  return useMemo(
    () => ({
      namespace: 'lexical-basic-rich-text',
      theme: editorTheme,
      nodes: editorNodes,
      onError,
      editorState: seedInitialState,
    }),
    []
  );
}

export default useEditorConfig;
