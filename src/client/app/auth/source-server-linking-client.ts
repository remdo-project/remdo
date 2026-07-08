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

// Links a source by URL: POST to start OAuth and, on success, follow the
// authorize redirect the server returns.
export async function linkSourceByUrl(url: string): Promise<void> {
  const response = await fetch('/api/current-user/source-links', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const parsed = await readJsonResponse<LinkSourceServerResponse>(response);
  if (parsed.redirect) {
    globalThis.location.assign(parsed.url);
  }
}
