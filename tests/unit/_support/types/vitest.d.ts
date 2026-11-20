import type { Fixture } from '#tools/fixtures';
import type { SelectionSnapshot } from '#tests';
import type { RemdoTestApi } from '#client/editor/dev';
import type { EditorViewBindings } from '#client/editor/view/EditorViewProvider';

interface RemdoTaskMeta {
  collabDocId?: string;
  fixture?: Fixture;
  /** A new-format test document the editor starts from, instead of a fixture. */
  document?: string;
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
    toMatchOutline: (expected: string) => void;
    toMatchDocument: (expected: string) => void;
    toMatchSelection: (expected: SelectionSnapshot) => void;
    toMatchEditorState: (expected: unknown) => void;
  }

  interface AsymmetricMatchersContaining {
    toMatchOutline: (expected: string) => void;
    toMatchDocument: (expected: string) => void;
    toMatchSelection: (expected: SelectionSnapshot) => void;
    toMatchEditorState: (expected: unknown) => void;
  }
}
