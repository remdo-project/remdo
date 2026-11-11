import type { SerializedEditorState } from 'lexical';
import type { SelectionSnapshot } from '#tests';
import type { RemdoTestApi } from '#client/editor/dev';
import type { EditorViewBindings } from '#client/editor/view/EditorViewProvider';

interface RemdoTaskMeta {
  collabDocId?: string;
  /** A fixture's name, or an editor state test documents can't hold. */
  fixture?: string | SerializedEditorState;
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
    toMatchSelection: (expected: SelectionSnapshot) => void;
    toMatchEditorState: (expected: unknown) => void;
  }

  interface AsymmetricMatchersContaining {
    toMatchOutline: (expected: string) => void;
    toMatchSelection: (expected: SelectionSnapshot) => void;
    toMatchEditorState: (expected: unknown) => void;
  }
}
