import type { Outline, SelectionSnapshot } from '#tests';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import type { EditorViewBindings } from '@/editor/view/EditorViewProvider';

interface RemdoTaskMeta {
  collabDocId?: string;
  preserveCollabState?: boolean;
  fixture?: string;
  fixtureSchemaBypass?: boolean;
  expectedConsoleIssues?: string[];
  viewProps?: EditorViewBindings;
}

declare module '@vitest/runner' {
  interface TaskMeta extends RemdoTaskMeta {
  }
}

declare module 'vitest' {
  interface TaskMeta extends RemdoTaskMeta {
  }

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
