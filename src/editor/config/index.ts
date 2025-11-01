import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { onError } from './error-handler';
import { editorNodes } from './nodes';
import { editorTheme } from './theme';

export const editorInitialConfig: InitialConfigType = {
  namespace: 'lexical-basic-rich-text',
  theme: editorTheme,
  nodes: editorNodes,
  onError,
  editorState: null,
};

export default editorInitialConfig;
