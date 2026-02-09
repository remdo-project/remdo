import { createDocumentPath, parseDocumentRef } from '@/routing';

export interface InternalNoteLink {
  docId: string;
  noteId: string;
}

export function createInternalNoteLinkUrl(docId: string, noteId: string): string {
  return createDocumentPath(docId, noteId);
}

export function parseInternalNoteLinkUrl(url: string): InternalNoteLink | null {
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
  return { docId: parsedRef.docId, noteId: parsedRef.noteId };
}
