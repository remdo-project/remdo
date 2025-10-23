import type { LexicalEditor } from 'lexical';
import { env } from '#env-client';

export function onError(error: Error, _editor: LexicalEditor) {
  if (env.mode !== 'production') {
    throw error;
  }

  console.error(error);
}
