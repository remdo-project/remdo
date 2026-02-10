import { createDocumentPath, parseDocumentRef } from '@/routing';

export interface InternalNoteLink {
  noteId: string;
  docId?: string;
}

export function createInternalNoteLinkUrl(link: InternalNoteLink, currentDocId: string): string {
  const docId = link.docId && link.docId.length > 0 ? link.docId : currentDocId;
  return createDocumentPath(docId, link.noteId);
}

export function parseInternalNoteLinkUrl(url: string, currentDocId?: string): InternalNoteLink | null {
  let parsedUrl: URL;
  try {
    const locationCandidate = Reflect.get(globalThis as object, 'location') as { href?: unknown } | undefined;
    const base = typeof locationCandidate?.href === 'string' ? locationCandidate.href : 'http://localhost';
    parsedUrl = new URL(url, base);
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
