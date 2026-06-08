export interface LinkableSourceServerView {
  id: string;
  label: string;
  baseUrl: string;
  linked: boolean;
}

interface LinkableSourceServersResponse {
  servers: LinkableSourceServerView[];
}

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

export async function fetchLinkableSourceServers(): Promise<LinkableSourceServerView[]> {
  const response = await fetch('/api/current-user/source-servers', {
    credentials: 'same-origin',
  });
  const body = await readJsonResponse<LinkableSourceServersResponse>(response);
  return body.servers;
}

export async function linkSourceServerAccount(serverId: string): Promise<void> {
  const response = await fetch(`/api/current-user/source-servers/${encodeURIComponent(serverId)}/account-links`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-remdo-action': 'source-server-link',
    },
    body: '{}',
  });
  const body = await readJsonResponse<LinkSourceServerResponse>(response);
  if (body.redirect) {
    globalThis.location.assign(body.url);
  }
}
