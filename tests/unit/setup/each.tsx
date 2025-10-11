import type { LexicalEditor } from 'lexical';
import type {TestContext} from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach  } from 'vitest';

import Editor from '@/editor/Editor';
import { lexicalMutate, lexicalValidate } from '#test/utils/lexical-helpers';
import LexicalTestBridge from '#test/utils/LexicalTestBridge';

beforeEach<TestContext>(async (ctx) => {
  let editor: LexicalEditor | null = null;

  render(
    <Editor
      extraPlugins={<LexicalTestBridge onReady={(e) => { editor = e; }} />}
    />
  );

  await waitFor(() => {
    if (!editor) throw new Error('Lexical editor not initialized in time');
  });

  ctx.lexicalMutate = (fn, opts) => lexicalMutate(editor!, fn, opts);
  ctx.lexicalValidate = <T,>(fn: () => T) => lexicalValidate(editor!, fn);
  ctx.editor = editor!;
});

afterEach(() => {
  cleanup();
});
