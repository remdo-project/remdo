import type { LexicalEditor } from 'lexical';
import { lexicalGetEditorState, lexicalLoad, lexicalMutate, lexicalValidate } from './state';
import type { LexicalTestHelpers } from './types';

export function createLexicalTestHelpers(editor: LexicalEditor): LexicalTestHelpers {
  return {
    editor,
    load: (filename: string) => lexicalLoad(editor, filename),
    mutate: (fn, opts) => lexicalMutate(editor, fn, opts),
    validate: (fn) => lexicalValidate(editor, fn),
    getEditorState: () => lexicalGetEditorState(editor),
  } as LexicalTestHelpers;
}
