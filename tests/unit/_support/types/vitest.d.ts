import type { Outline } from '#tests';
import type { LexicalTestHelpers as LexicalHelpers } from '../setup/lexical/types';

declare module 'vitest' {
  interface LexicalTestHelpers extends LexicalHelpers {}

  export interface TestContext {
    lexical: LexicalHelpers;
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
