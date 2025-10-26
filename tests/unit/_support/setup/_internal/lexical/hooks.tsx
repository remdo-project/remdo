/* eslint-disable react-refresh/only-export-components */
import type { LexicalEditor } from 'lexical';
import { useEffect } from 'react';
import type { TestContext } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { beforeEach } from 'vitest';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import Editor from '@/editor/Editor';
import { createLexicalTestHelpers } from './state';

const Bridge = ({ onReady }: { onReady: (editor: LexicalEditor) => void }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);

  return null;
};

const LexicalHarness = ({ onReady }: { onReady: (editor: LexicalEditor) => void }) => {
  return (
    <Editor>
      <Bridge onReady={onReady} />
    </Editor>
  );
};

beforeEach<TestContext>(async (ctx) => {
  let editor!: LexicalEditor;

  render(<LexicalHarness onReady={(instance) => { editor = instance; }} />);

  await waitFor(() => {
    if (!editor) throw new Error('Lexical editor not initialized in time');
  });

  ctx.lexical = createLexicalTestHelpers(editor);
});
