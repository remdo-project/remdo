import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServerApp } from '@/server/app';
import { createServerAuth } from '@/server/auth/auth';
import { createServerDatabaseClient } from '@/server/db/client';
import { createDocumentRegistry } from '@/server/documents/document-registry';

export const TEST_USER = {
  email: 'server@example.com',
  name: 'Server Test User',
  password: 'server-password-1234',
} as const;
export const TEST_ADMIN_SECRET = 'test-admin-secret-0123456789';
const SESSION_COOKIE_PATTERN = /better-auth\.session_token=([^;]+)/u;

export function extractSessionCookie(response: Response): string {
  const extendedHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const getSetCookie = typeof extendedHeaders.getSetCookie === 'function' ? extendedHeaders.getSetCookie() : [];
  const header = getSetCookie[0] ?? response.headers.get('set-cookie') ?? '';
  const match = header.match(SESSION_COOKIE_PATTERN);
  if (!match) {
    throw new Error('Better Auth session cookie missing from response.');
  }
  return `better-auth.session_token=${match[1]}`;
}

export function createServerAppHarness({
  adminSecret = TEST_ADMIN_SECRET,
  baseURL = 'http://127.0.0.1:4000',
}: {
  adminSecret?: string;
  baseURL?: string;
} = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-server-auth-'));
  const dbPath = path.join(tempDir, 'remdo.sqlite');
  const auth = createServerAuth({
    allowSignup: false,
    baseURL,
    dbPath,
    secret: 'test-better-auth-secret-0123456789',
  });
  const client = createServerDatabaseClient({ dbPath });
  const registry = createDocumentRegistry({ client });
  const app = createServerApp({
    adminSecret,
    auth,
    registry,
    logError: () => {},
  });

  return {
    app,
    auth,
    registry,
    async createSessionHeaders() {
      await auth.ensureReady();
      const response = auth.getUserCount() === 0
        ? await app.request('/api/admin/users', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              ...TEST_USER,
              adminSecret: TEST_ADMIN_SECRET,
            }),
          })
        : await app.request('/api/auth/sign-in/email', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              email: TEST_USER.email,
              password: TEST_USER.password,
            }),
          });

      return new Headers({
        cookie: extractSessionCookie(response),
      });
    },
    cleanup() {
      client.close();
      auth.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
