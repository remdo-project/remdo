const NOTE_LINK_URL_PREFIX = 'remdo://note/';

export function createInternalNoteLinkUrl(noteId: string): string {
  return `${NOTE_LINK_URL_PREFIX}${encodeURIComponent(noteId)}`;
}

export function parseInternalNoteLinkUrl(url: string): string | null {
  if (!url.startsWith(NOTE_LINK_URL_PREFIX)) {
    return null;
  }

  const encoded = url.slice(NOTE_LINK_URL_PREFIX.length);
  if (encoded.length === 0) {
    return null;
  }

  try {
    const noteId = decodeURIComponent(encoded);
    return noteId.length > 0 ? noteId : null;
  } catch {
    return null;
  }
}
