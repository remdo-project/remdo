import type { Outline, SelectionSnapshot } from '#tests';
import type { RemdoTestApi } from '@/editor/plugins/dev';

declare module 'vitest' {
  interface RemdoTestHelpers extends RemdoTestApi {
    load: (name: string) => Promise<void>;
  }

  export interface TestContext {
    remdo: RemdoTestHelpers;
  }

  interface TestCollectorOptions {
    meta?: Record<string, unknown>;
  }

  interface Assertion<T = any> {
    toMatchOutline: (expected: Outline) => void;
    toMatchSelection: (expected: SelectionSnapshot) => void;
    toMatchSelectionIds: (expected: string[]) => void;
    toMatchEditorState: (expected: unknown) => void;
  }

  interface AsymmetricMatchersContaining {
    toMatchOutline: (expected: Outline) => void;
    toMatchSelection: (expected: SelectionSnapshot) => void;
    toMatchSelectionIds: (expected: string[]) => void;
    toMatchEditorState: (expected: unknown) => void;
  }
}
