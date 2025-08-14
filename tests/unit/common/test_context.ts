import {
  BoundFunctions,
  getAllByRole,
  queries,
  RenderResult,
} from '@testing-library/react';
import { expect } from 'vitest';
import { RemdoLexicalEditor } from '@/components/Editor/plugins/remdo/ComposerContext';
import { Note } from '@/components/Editor/plugins/remdo/utils/api';

export type Queries = BoundFunctions<
  typeof queries & { getAllNotNestedIListItems: typeof getAllByRole.bind }
>;

declare module 'vitest' {
  //TODO consider using external functions instead of extending context
  export interface TestContext {
    component: RenderResult;
    queries: Queries;
    lexicalUpdate: (fn: () => void) => void;
    load: (name: string) => Record<string, Note>;
    editor: RemdoLexicalEditor;
    expect: typeof expect;
  }
}


