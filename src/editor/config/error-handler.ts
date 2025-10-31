import type { LexicalEditor } from 'lexical';
import { env } from '#config/env.client';

export function onError(error: Error, _editor: LexicalEditor) {
  if (env.mode !== 'production') {
    throw error;
  }

  console.error(error);
}
