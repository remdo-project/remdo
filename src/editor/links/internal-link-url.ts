import { createDocumentPath, DEFAULT_DOC_ID, parseDocumentRef } from '@/routing';

export interface InternalNoteLink {
  noteId: string;
  docId?: string;
}

export function resolveCurrentDocIdFromLocation(): string {
  const path = globalThis.location.pathname;
  const match = /^\/n\/([^/]+)$/.exec(path);
  if (!match) {
    return DEFAULT_DOC_ID;
  }

  const parsed = parseDocumentRef(match[1]);
  return parsed?.docId ?? DEFAULT_DOC_ID;
}

export function createInternalNoteLinkUrl(link: InternalNoteLink, currentDocId: string): string {
  const docId = link.docId && link.docId.length > 0 ? link.docId : currentDocId;
  return createDocumentPath(docId, link.noteId);
}

export function parseInternalNoteLinkUrl(url: string, currentDocId?: string): InternalNoteLink | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url, globalThis.location.href);
  } catch {
    return null;
  }

  const match = /^\/n\/([^/]+)$/.exec(parsedUrl.pathname);
  if (!match) {
    return null;
  }

  const parsedRef = parseDocumentRef(match[1]);
  if (!parsedRef?.noteId) {
    return null;
  }
  if (currentDocId && parsedRef.docId === currentDocId) {
    return { noteId: parsedRef.noteId };
  }
  return { docId: parsedRef.docId, noteId: parsedRef.noteId };
}
