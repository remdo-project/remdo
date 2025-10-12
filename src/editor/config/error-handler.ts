import type { LexicalEditor } from 'lexical';

export function onError(error: Error, _editor: LexicalEditor) {
  if (import.meta.env.MODE !== 'production') {
    throw error;
  }

  console.error(error);
}
