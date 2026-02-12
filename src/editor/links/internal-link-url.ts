import { parseDocumentRef } from '@/routing';

export interface InternalNoteLink {
  noteId: string;
  docId?: string;
}

// Temporary base so URL() can parse relative internal-link paths in non-browser contexts.
// Drop once callers provide normalized absolute/internal path input.
const URL_PARSE_BASE = 'http://localhost';

export function parseInternalNoteLinkUrl(url: string, currentDocId?: string): InternalNoteLink | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url, URL_PARSE_BASE);
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
