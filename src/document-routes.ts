import { normalizeDocumentId } from '#domain/documents/ids';
import { normalizeNoteId, normalizeNoteIdOrThrow } from '#domain/notes/ids';

export function resolveDevDocumentId(rawDocId: string): string {
  const raw = rawDocId;
  if (raw.trim().length === 0) {
    return 'devDoc';
  }
  return normalizeNoteIdOrThrow(raw, 'DEV_DOCUMENT_ID must be a valid note-id-compatible identifier.');
}

const NOTE_REF_SEPARATOR = '_';
const APP_DOCUMENT_PATH_PREFIX = '/n';

interface NoteRef {
  docId: string;
  noteId: string;
}

export function createNoteRef(docId: string, noteId: string): string {
  const normalizedDocId = normalizeNoteIdOrThrow(docId, 'createNoteRef requires valid document and note ids.');
  const normalizedNoteId = normalizeNoteIdOrThrow(noteId, 'createNoteRef requires valid document and note ids.');
  return `${normalizedDocId}${NOTE_REF_SEPARATOR}${normalizedNoteId}`;
}

export function parseNoteRef(noteRef: string): NoteRef | null {
  const separatorIndex = noteRef.indexOf(NOTE_REF_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex >= noteRef.length - 1) {
    return null;
  }
  const docId = normalizeDocumentId(noteRef.slice(0, separatorIndex));
  const noteId = normalizeNoteId(noteRef.slice(separatorIndex + 1));
  if (!docId || !noteId) {
    return null;
  }
  return { docId, noteId };
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
