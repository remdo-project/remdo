import type { EditorUpdateOptions, LexicalEditor } from 'lexical';
import type { Outline } from '../helpers/note';

type EditorStateJSON = ReturnType<ReturnType<LexicalEditor['getEditorState']>['toJSON']>;

declare module 'vitest' {
  interface LexicalTestHelpers {
    editor: LexicalEditor;
    load: (filename: string) => void;
    mutate: (
      fn: () => void,
      opts?: EditorUpdateOptions
    ) => Promise<void>;
    validate: <T>(fn: () => T) => T;
    getEditorState: () => EditorStateJSON;
  }

  export interface TestContext {
    lexical: LexicalTestHelpers;
  }

  interface Assertion<T = any> {
    toMatchOutline: (expected: Outline) => void;
    toMatchEditorState: (expected: unknown) => void;
  }

  interface AsymmetricMatchersContaining {
    toMatchOutline: (expected: Outline) => void;
    toMatchEditorState: (expected: unknown) => void;
  }
}
