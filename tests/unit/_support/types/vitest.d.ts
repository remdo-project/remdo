import type { Outline, SelectionSnapshot } from '#tests';
import type { RemdoTestApi } from '@/editor/plugins/TestBridgePlugin';

declare module 'vitest' {
  interface RemdoTestHelpers extends RemdoTestApi {
    load: (name: string) => Promise<void>;
  }

  export interface TestContext {
    remdo: RemdoTestHelpers;
    // Legacy alias for migration; remove once specs switch to remdo.
    lexical: RemdoTestHelpers;
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
