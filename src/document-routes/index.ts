import { normalizeDocumentId } from '#domain/documents/ids';
import { normalizeNoteId, normalizeNoteIdOrThrow } from '#domain/notes/ids';
import { normalizeSourceServerId } from '#domain/source-servers';

const NOTE_REF_SEPARATOR = '_';
const APP_DOCUMENT_PATH_PREFIX = '/n';

export function createNoteRef(docId: string, noteId: string): string {
  const normalizedDocId = normalizeNoteIdOrThrow(docId, 'createNoteRef requires valid document and note ids.');
  const normalizedNoteId = normalizeNoteIdOrThrow(noteId, 'createNoteRef requires valid document and note ids.');
  return `${normalizedDocId}${NOTE_REF_SEPARATOR}${normalizedNoteId}`;
}

function createDocumentPathWithPrefix(prefix: string, docId: string, noteId: string | null = null): string {
  const normalizedDocId = normalizeNoteIdOrThrow(docId, 'createDocumentPath requires a valid document id.');

  if (noteId !== null) {
    const normalizedNoteId = normalizeNoteIdOrThrow(
      noteId,
      'createDocumentPath requires a valid note id when noteId is provided.',
    );
    return `${prefix}/${createNoteRef(normalizedDocId, normalizedNoteId)}`;
  }
  return `${prefix}/${normalizedDocId}`;
}

export function createDocumentPath(docId: string, noteId: string | null = null): string {
  return createDocumentPathWithPrefix(APP_DOCUMENT_PATH_PREFIX, docId, noteId);
}

export function createDocumentSyncTokenApiPath(docId: string): string {
  const normalizedDocId = normalizeNoteIdOrThrow(
    docId,
    'createDocumentSyncTokenApiPath requires a valid document id.',
  );
  return `/api/documents/${encodeURIComponent(normalizedDocId)}/sync-tokens`;
}

export function createSourceDocumentSyncTokenApiPath(sourceId: string, docId: string): string {
  const normalizedSourceId = normalizeSourceServerId(sourceId);
  if (!normalizedSourceId) {
    throw new Error('createSourceDocumentSyncTokenApiPath requires a valid source id.');
  }
  const normalizedDocId = normalizeNoteIdOrThrow(
    docId,
    'createSourceDocumentSyncTokenApiPath requires a valid document id.',
  );
  return `/api/current-user/source-servers/${encodeURIComponent(normalizedSourceId)}/documents/${
    encodeURIComponent(normalizedDocId)
  }/sync-tokens`;
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

  const separatorIndex = trimmedRef.indexOf(NOTE_REF_SEPARATOR);
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
