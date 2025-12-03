import type { Outline, SelectionSnapshot } from '#tests';
import type { LexicalTestHelpers as LexicalHelpers } from '../lib/types';

declare module 'vitest' {
  interface LexicalTestHelpers extends LexicalHelpers {}

  export interface TestContext {
    lexical: LexicalHelpers;
  }

  interface TestCollectorOptions {
    meta?: Record<string, unknown>;
  }

  interface Assertion<T = any> {
    toMatchOutline: (expected: Outline) => void;
    toMatchSelection: (expected: SelectionSnapshot) => void;
    toMatchEditorState: (expected: unknown) => void;
  }

  interface AsymmetricMatchersContaining {
    toMatchOutline: (expected: Outline) => void;
    toMatchSelection: (expected: SelectionSnapshot) => void;
    toMatchEditorState: (expected: unknown) => void;
  }
}
