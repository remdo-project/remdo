import type { DocumentAccessView } from '#domain/documents/access';

export type { DocumentAccessView } from '#domain/documents/access';

const SHARING_ACTION_HEADER = 'x-remdo-action';
const SHARING_ACTION_VALUE = 'sharing';

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchDocumentAccess(docId: string): Promise<DocumentAccessView[]> {
  const response = await fetch(`/api/documents/${encodeURIComponent(docId)}/access`, {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(await readError(response, 'Failed to load document access.'));
  }
  const body = await response.json() as { access?: DocumentAccessView[] };
  return body.access ?? [];
}

export async function shareDocumentWithUser(docId: string, email: string): Promise<DocumentAccessView> {
  const response = await fetch(`/api/documents/${encodeURIComponent(docId)}/access`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      [SHARING_ACTION_HEADER]: SHARING_ACTION_VALUE,
    },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, 'Failed to share document.'));
  }
  const body = await response.json() as { access?: DocumentAccessView };
  if (!body.access) {
    throw new TypeError('Document sharing returned an invalid access grant.');
  }
  return body.access;
}
