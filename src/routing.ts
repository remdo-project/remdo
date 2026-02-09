import { config } from '#config';

export const DEFAULT_DOC_ID = (() => {
  const candidate = config.env.COLLAB_DOCUMENT_ID.trim();
  return candidate && candidate.length > 0 ? candidate : 'main';
})();

const NOTE_REF_SEPARATOR = '_';

export interface NoteRef {
  docId: string;
  noteId: string;
}

export function createNoteRef(docId: string, noteId: string): string {
  return `${docId}${NOTE_REF_SEPARATOR}${noteId}`;
}

export function parseNoteRef(noteRef: string): NoteRef | null {
  const separatorIndex = noteRef.indexOf(NOTE_REF_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex >= noteRef.length - 1) {
    return null;
  }
  const docId = noteRef.slice(0, separatorIndex);
  const noteId = noteRef.slice(separatorIndex + 1);
  return { docId, noteId };
}

export function createDocumentPath(docId: string, noteId: string | null = null): string {
  if (noteId) {
    return `/n/${createNoteRef(docId, noteId)}`;
  }
  return `/n/${docId}`;
}

export interface ParsedDocumentRef {
  docId: string;
  noteId: string | null;
}

export function parseDocumentRef(docRef: string | undefined): ParsedDocumentRef | null {
  if (!docRef) {
    return null;
  }

  const separatorIndex = docRef.indexOf(NOTE_REF_SEPARATOR);
  if (separatorIndex === -1) {
    return { docId: docRef, noteId: null };
  }
  if (separatorIndex === 0 || separatorIndex === docRef.length - 1) {
    return null;
  }
  return {
    docId: docRef.slice(0, separatorIndex),
    noteId: docRef.slice(separatorIndex + 1),
  };
}
