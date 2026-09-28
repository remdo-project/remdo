import type { components } from '#platform/http/api-schema';

type Config = components['schemas']['Config'];
type Document = components['schemas']['Document'];

export interface DemoAccount {
  email: string;
  password: string;
}

// Render services, the HTTPS targets, name the account after their public host;
// other instances use the fixed deployment-account domain.
export function demoAccount(origin: string, password: string): DemoAccount {
  const url = new URL(origin);
  const domain = url.protocol === 'https:' ? url.hostname : 'example.test';
  return { email: `user@${domain}`, password };
}

class Session {
  private readonly cookies = new Map<string, string>();
  private csrfToken = '';

  constructor(private readonly origin: string) {}

  async request(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await fetch(new URL(path, this.origin), {
      method,
      headers: {
        Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
        // Django's HTTPS CSRF check requires a same-origin Origin or Referer.
        Origin: this.origin,
        'X-CSRFToken': this.csrfToken,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const separator = pair.indexOf('=');
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    if (!response.ok) {
      throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
    }
    return response;
  }

  async refreshCsrfToken(): Promise<void> {
    this.csrfToken = (await (await this.request('GET', '/api/config')).json() as Config).csrfToken;
  }
}

export interface DemoReset {
  document: Document;
  deleted: number;
  sharedRemaining: number;
}

export async function resetDemoAccount(origin: string, account: DemoAccount): Promise<DemoReset> {
  const session = new Session(origin);
  await session.refreshCsrfToken();
  await session.request('POST', '/api/auth/browser/v1/auth/login', account);
  await session.refreshCsrfToken();

  const documents = await (await session.request('GET', '/api/documents')).json() as Document[];
  const owned = documents.filter((document) => document.deletable);
  for (const document of owned) {
    await session.request('DELETE', `/api/documents/${encodeURIComponent(document.id)}`);
  }
  const document = await (await session.request('POST', '/api/documents', { title: 'New Document' })).json() as Document;
  return { document, deleted: owned.length, sharedRemaining: documents.length - owned.length };
}
