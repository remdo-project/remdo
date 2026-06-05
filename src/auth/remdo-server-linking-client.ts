export interface LinkableRemdoServerView {
  id: string;
  label: string;
  baseUrl: string;
  linked: boolean;
}

interface LinkableRemdoServersResponse {
  servers: LinkableRemdoServerView[];
}

interface LinkRemdoServerResponse {
  redirect: boolean;
  url: string;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as { error?: string } & T;
  if (!response.ok) {
    throw new Error(body.error ?? 'RemDo server link request failed.');
  }
  return body;
}

export async function fetchLinkableRemdoServers(): Promise<LinkableRemdoServerView[]> {
  const response = await fetch('/api/remdo-server-links', {
    credentials: 'same-origin',
  });
  const body = await readJsonResponse<LinkableRemdoServersResponse>(response);
  return body.servers;
}

export async function linkRemdoServerAccount(serverId: string): Promise<void> {
  const response = await fetch(`/api/remdo-server-links/${encodeURIComponent(serverId)}/link`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-remdo-action': 'remdo-server-link',
    },
    body: '{}',
  });
  const body = await readJsonResponse<LinkRemdoServerResponse>(response);
  if (body.redirect) {
    globalThis.location.assign(body.url);
  }
}
