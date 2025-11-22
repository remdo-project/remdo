import type { EditorUpdateOptions, LexicalEditor } from 'lexical';

export type EditorStateJSON = ReturnType<ReturnType<LexicalEditor['getEditorState']>['toJSON']>;

export interface LexicalTestHelpers {
  editor: LexicalEditor;
  load: (filename: string) => Promise<void>;
  mutate: (fn: () => void, opts?: EditorUpdateOptions) => Promise<void>;
  validate: <T>(fn: () => T) => T;
  getEditorState: () => EditorStateJSON;
  waitForHydrated: () => Promise<void>;
  waitForSynced: () => Promise<void>;
  getCollabDocId: () => string;
}
