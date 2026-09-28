#!/usr/bin/env tsx
import process from 'node:process';

import type { components } from '#platform/http/api-schema';

type Config = components['schemas']['Config'];
type Document = components['schemas']['Document'];

const USAGE = 'Usage: pnpm hosted:demo-reset [origin], default https://remdo.com';

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

async function main(): Promise<void> {
  const [originArgument = 'https://remdo.com', ...extra] = process.argv.slice(2);
  if (extra.length > 0) {
    throw new Error(USAGE);
  }
  const origin = new URL(originArgument).origin;
  // eslint-disable-next-line node/no-process-env -- a deployment secret, absent from the development config schema.
  const password = process.env.REMDO_USER_PASSWORD;
  if (!password) {
    throw new Error('REMDO_USER_PASSWORD must hold the target service\'s generated user password.');
  }
  const email = `user@${new URL(origin).hostname}`;

  const session = new Session(origin);
  await session.refreshCsrfToken();
  await session.request('POST', '/api/auth/browser/v1/auth/login', { email, password });
  await session.refreshCsrfToken();

  const documents = await (await session.request('GET', '/api/documents')).json() as Document[];
  const owned = documents.filter((document) => document.deletable);
  for (const document of owned) {
    await session.request('DELETE', `/api/documents/${encodeURIComponent(document.id)}`);
  }
  await session.request('POST', '/api/documents', { title: 'New Document' });

  const skipped = documents.length - owned.length;
  const remaining = skipped > 0 ? `; ${skipped} document(s) shared by others remain` : '';
  console.info(`Reset ${email}: deleted ${owned.length} document(s), created 1 empty document${remaining}.`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
