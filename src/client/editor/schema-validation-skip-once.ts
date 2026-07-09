import type { LexicalEditor } from 'lexical';

const SKIP_SCHEMA_VALIDATION_ONCE = Symbol('remdo.skipSchemaValidationOnce');

type EditorWithSchemaValidationFlag = LexicalEditor & {
  [SKIP_SCHEMA_VALIDATION_ONCE]?: boolean;
};

export function markSchemaValidationSkipOnce(editor: LexicalEditor): void {
  (editor as EditorWithSchemaValidationFlag)[SKIP_SCHEMA_VALIDATION_ONCE] = true;
}

export function consumeSchemaValidationSkipOnce(editor: LexicalEditor): boolean {
  const flagged = (editor as EditorWithSchemaValidationFlag)[SKIP_SCHEMA_VALIDATION_ONCE];
  if (!flagged) {
    return false;
  }
  (editor as EditorWithSchemaValidationFlag)[SKIP_SCHEMA_VALIDATION_ONCE] = false;
  return true;
}
