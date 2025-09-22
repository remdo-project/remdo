// @ts-nocheck
// TODO(remdo): Replace Vitest context augmentation with dedicated helpers to reinstate type safety.
import {
  BoundFunctions,
  getAllByRole,
  queries,
  RenderResult,
} from '@testing-library/react';
import { expect } from 'vitest';
import { RemdoLexicalEditor } from '@/features/editor/plugins/remdo/ComposerContext';
import { Note } from '@/features/editor/plugins/remdo/utils/api';
import { DocumentSelectorType } from '@/features/editor/DocumentSelector/DocumentSelector';

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
    documentSelector: DocumentSelectorType;
    expect: typeof expect;
  }
}


