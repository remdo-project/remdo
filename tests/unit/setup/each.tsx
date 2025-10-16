import type { EditorUpdateOptions, LexicalEditor } from 'lexical';
import type { TestContext } from 'vitest';
import { lexicalGetEditorState, lexicalLoad, lexicalMutate, lexicalValidate } from '#test/setup/internal/lexical-helpers';
import LexicalTestBridge from '#test/setup/internal/LexicalTestBridge';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import Editor from '@/editor/Editor';

beforeEach<TestContext>(async (ctx) => {
  let editor!: LexicalEditor;

  render(
    <Editor>
      <LexicalTestBridge onReady={(e) => { editor = e; }} />
    </Editor>
  );

  await waitFor(() => {
    if (!editor) throw new Error('Lexical editor not initialized in time');
  });

  const load = (filename: string) => lexicalLoad(editor, filename);
  const mutate = (fn: () => void, opts?: EditorUpdateOptions) =>
    lexicalMutate(editor, fn, opts);
  const validate = <T,>(fn: () => T) => lexicalValidate(editor, fn);
  const getEditorState = () => lexicalGetEditorState(editor);

  ctx.lexical = {
    editor,
    load,
    mutate,
    validate,
    getEditorState,
  };
});

afterEach(() => {
  cleanup();
});
