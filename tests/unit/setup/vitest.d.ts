import type { EditorUpdateOptions, LexicalEditor } from 'lexical';

declare module 'vitest' {
  export interface TestContext {
    lexicalMutate: (
      fn: () => void,
      opts?: EditorUpdateOptions
    ) => Promise<void>;
    lexicalValidate: <T>(fn: () => T) => T;
    editor: LexicalEditor;
  }
}
