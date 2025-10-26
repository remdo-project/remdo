import type { LexicalEditor } from 'lexical';
import type { TestContext } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import Editor from '@/editor/Editor';
import { lexicalGetEditorState, lexicalLoad, lexicalMutate, lexicalValidate } from './state';
import { LexicalTestBridge } from './test-bridge';
import type { LexicalTestHelpers } from './types';

let registered = false;

export function registerLexicalTestHarness(): void {
  if (registered) return;
  registered = true;

  beforeEach<TestContext>(async (ctx) => {
    let editor!: LexicalEditor;

    render(
      <Editor>
        <LexicalTestBridge onReady={(instance) => { editor = instance; }} />
      </Editor>
    );

    await waitFor(() => {
      if (!editor) throw new Error('Lexical editor not initialized in time');
    });

    ctx.lexical = createLexicalTestHelpers(editor);
  });

  afterEach(() => {
    cleanup();
  });
}

function createLexicalTestHelpers(editor: LexicalEditor): LexicalTestHelpers {
  return {
    editor,
    load: (filename: string) => lexicalLoad(editor, filename),
    mutate: (fn, opts) => lexicalMutate(editor, fn, opts),
    validate: (fn) => lexicalValidate(editor, fn),
    getEditorState: () => lexicalGetEditorState(editor),
  } as LexicalTestHelpers;
}
