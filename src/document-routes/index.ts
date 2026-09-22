import { normalizeDocumentId } from '#domain/documents/ids';
import { normalizeNoteId, normalizeNoteIdOrThrow } from '#domain/notes/ids';

const NOTE_ADDRESS_SEPARATOR = '_';
const APP_DOCUMENT_PATH_PREFIX = '/n';

export function createNoteAddress(docId: string, noteId: string): string {
  const normalizedDocId = normalizeNoteIdOrThrow(docId, 'createNoteAddress requires valid document and note ids.');
  const normalizedNoteId = normalizeNoteIdOrThrow(noteId, 'createNoteAddress requires valid document and note ids.');
  return `${normalizedDocId}${NOTE_ADDRESS_SEPARATOR}${normalizedNoteId}`;
}

function createDocumentPathWithPrefix(prefix: string, docId: string, noteId: string | null = null): string {
  const normalizedDocId = normalizeNoteIdOrThrow(docId, 'createDocumentPath requires a valid document id.');

  if (noteId !== null) {
    const normalizedNoteId = normalizeNoteIdOrThrow(
      noteId,
      'createDocumentPath requires a valid note id when noteId is provided.',
    );
    return `${prefix}/${createNoteAddress(normalizedDocId, normalizedNoteId)}`;
  }
  return `${prefix}/${normalizedDocId}`;
}

export function createDocumentPath(docId: string, noteId: string | null = null): string {
  return createDocumentPathWithPrefix(APP_DOCUMENT_PATH_PREFIX, docId, noteId);
}

export interface ParsedDocumentRef {
  docId: string;
  noteId: string | null;
}

export function parseDocumentRef(docRef: string | undefined): ParsedDocumentRef | null {
  if (!docRef) {
    return null;
  }
  const trimmedRef = docRef.trim();
  if (trimmedRef.length === 0) {
    return null;
  }

  const separatorIndex = trimmedRef.indexOf(NOTE_ADDRESS_SEPARATOR);
  if (separatorIndex === -1) {
    const docId = normalizeDocumentId(trimmedRef);
    return docId ? { docId, noteId: null } : null;
  }
  if (separatorIndex === 0 || separatorIndex === trimmedRef.length - 1) {
    return null;
  }
  const docId = normalizeDocumentId(trimmedRef.slice(0, separatorIndex));
  const noteId = normalizeNoteId(trimmedRef.slice(separatorIndex + 1));
  if (!docId || !noteId) {
    return null;
  }
  return {
    docId,
    noteId,
  };
}
