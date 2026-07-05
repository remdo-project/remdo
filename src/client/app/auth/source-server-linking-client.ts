interface LinkSourceServerResponse {
  redirect: boolean;
  url: string;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as { error?: string } & T;
  if (!response.ok) {
    throw new Error(body.error ?? 'Source server link request failed.');
  }
  return body;
}

// Both link entry points POST to start OAuth and, on success, follow the
// authorize redirect the server returns.
async function postLinkRequest(path: string, body: unknown): Promise<void> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await readJsonResponse<LinkSourceServerResponse>(response);
  if (parsed.redirect) {
    globalThis.location.assign(parsed.url);
  }
}

export async function linkSourceServerAccount(serverId: string): Promise<void> {
  await postLinkRequest(`/api/current-user/source-servers/${encodeURIComponent(serverId)}/account-links`, {});
}

export async function linkSourceByUrl(url: string): Promise<void> {
  await postLinkRequest('/api/current-user/source-links', { url });
}
