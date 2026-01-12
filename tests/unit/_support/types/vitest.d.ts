import type { Outline, SelectionSnapshot } from '#tests';
import type { RemdoTestApi } from '@/editor/plugins/dev';

declare module 'vitest' {
  interface RemdoTestHelpers extends RemdoTestApi {
  }

  export interface TestContext {
    remdo: RemdoTestHelpers;
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
