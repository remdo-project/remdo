import type { EditorUpdateOptions, LexicalEditor } from 'lexical';

declare module 'vitest' {
  interface LexicalTestHelpers {
    editor: LexicalEditor;
    mutate: (
      fn: () => void,
      opts?: EditorUpdateOptions
    ) => Promise<void>;
    validate: <T>(fn: () => T) => T;
  }

  export interface TestContext {
    lexical: LexicalTestHelpers;
  }
}
