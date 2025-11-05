import { config } from '#config/client';
import { DEFAULT_DOC_ID } from '#config/spec';

const DOCUMENT_QUERY_PARAM = 'doc';

export function resolveCollabDocumentId(): string {
  const defaultDocId = config.COLLAB_DOCUMENT_ID ?? DEFAULT_DOC_ID;

  if (typeof window === 'undefined') {
    return defaultDocId;
  }

  const params = new URLSearchParams(window.location.search);
  const docId = params.get(DOCUMENT_QUERY_PARAM)?.trim();

  return docId && docId.length > 0 ? docId : defaultDocId;
}
