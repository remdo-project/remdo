import { DEFAULT_DOC_ID } from '#config/spec';

const DOCUMENT_QUERY_PARAM = 'doc';

export function resolveCollabDocumentId(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_DOC_ID;
  }

  const params = new URLSearchParams(window.location.search);
  const docId = params.get(DOCUMENT_QUERY_PARAM)?.trim();

  return docId && docId.length > 0 ? docId : DEFAULT_DOC_ID;
}
