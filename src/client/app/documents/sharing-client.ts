export interface AccessRequestView {
  documentId: string;
  requesterUserId: string;
  status: string;
}

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

async function sendSharingAction(method: 'PATCH' | 'POST', path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      [SHARING_ACTION_HEADER]: SHARING_ACTION_VALUE,
    },
    body: JSON.stringify(body),
  });
}

async function requireOk(response: Response, fallback: string): Promise<void> {
  if (!response.ok) {
    throw new Error(await readError(response, fallback));
  }
}

export async function approveDocumentAccessRequest(docId: string, requesterUserId: string): Promise<void> {
  await requireOk(
    await sendSharingAction(
      'POST',
      `/api/documents/${encodeURIComponent(docId)}/access-requests/${encodeURIComponent(requesterUserId)}/approve`,
      {},
    ),
    'Failed to approve access.',
  );
}

export async function fetchAccessRequests(docId: string): Promise<AccessRequestView[]> {
  const response = await fetch(`/api/documents/${encodeURIComponent(docId)}/access-requests`, {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(await readError(response, 'Failed to load access requests.'));
  }
  const body = await response.json() as { requests?: AccessRequestView[] };
  return body.requests ?? [];
}

export async function requestDocumentAccess(docId: string): Promise<void> {
  await requireOk(
    await sendSharingAction('POST', `/api/documents/${encodeURIComponent(docId)}/access-requests`, {}),
    'Failed to request access.',
  );
}

export async function setDocumentAccessMode(docId: string, accessMode: 'private' | 'shareable'): Promise<void> {
  await requireOk(
    await sendSharingAction('PATCH', `/api/documents/${encodeURIComponent(docId)}/access-mode`, { accessMode }),
    'Failed to update access mode.',
  );
}
