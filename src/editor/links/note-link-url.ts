import { parseDocumentRef } from '@/routing';

interface NoteLink {
  noteId: string;
  docId: string;
}

interface OwnedNoteLinkUrlOptions {
  currentDocId?: string;
  currentOrigin?: string;
}

// Temporary base so URL() can parse relative note-link paths in non-browser contexts.
// Drop once callers provide normalized absolute note-link input.
const URL_PARSE_BASE = 'http://localhost';
const NOTE_LINK_PATH_PATTERN = /^\/n\/([^/]+)$/;

export function parseNoteLinkUrl(url: string, currentDocId?: string): NoteLink | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url, URL_PARSE_BASE);
  } catch {
    return null;
  }

  const match = NOTE_LINK_PATH_PATTERN.exec(parsedUrl.pathname);
  if (!match) {
    return null;
  }

  const parsedRef = parseDocumentRef(match[1]);
  if (!parsedRef?.noteId) {
    return null;
  }
  if (currentDocId && parsedRef.docId === currentDocId) {
    return { docId: currentDocId, noteId: parsedRef.noteId };
  }
  return { docId: parsedRef.docId, noteId: parsedRef.noteId };
}

export function parseOwnedNoteLinkUrl(url: string, options: OwnedNoteLinkUrlOptions = {}): NoteLink | null {
  const { currentDocId, currentOrigin } = options;
  const hasOwnOrigin = /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//');
  if (hasOwnOrigin) {
    if (!currentOrigin) {
      return null;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url, currentOrigin);
    } catch {
      return null;
    }
    if (parsedUrl.origin !== currentOrigin) {
      return null;
    }
  }

  return parseNoteLinkUrl(url, currentDocId);
}
