import { normalizeNoteId } from '#domain/notes/ids';

export function normalizeDocumentId(value: unknown): string | null {
  return normalizeNoteId(value);
}
