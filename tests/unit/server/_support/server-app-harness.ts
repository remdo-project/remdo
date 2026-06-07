import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServerApp } from '@/server/app';
import { createServerAuth } from '@/server/auth/auth';
import type { CreateAuthUserInput } from '@/server/auth/auth';
import type { YSweetDocumentTokenManager } from '@/server/collab-token';
import { createServerDatabaseClient } from '@/server/db/client';
import type { LinkableRemdoServer } from '@/server/remdo-oauth/config';
import { createDocumentRegistry } from '@/server/documents/document-registry';
import * as Y from 'yjs';

const TEST_USER = {
  email: 'server@example.com',
  name: 'Server Test User',
  password: 'server-password-1234',
} as const;
export const TEST_ADMIN_SECRET = 'test-admin-secret-0123456789';
const SESSION_COOKIE_PATTERN = /better-auth\.session_token=([^;]+)/u;

function extractSessionCookie(response: Response): string {
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
  linkableRemdoServers = [],
  onUpdateDoc,
}: {
  adminSecret?: string;
  baseURL?: string;
  linkableRemdoServers?: readonly LinkableRemdoServer[];
  onUpdateDoc?: (docId: string, update: Uint8Array) => void | Promise<void>;
} = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-server-auth-'));
  const dbPath = path.join(tempDir, 'remdo.sqlite');
  const client = createServerDatabaseClient({ dbPath });
  const auth = createServerAuth({
    allowSignup: false,
    baseURL,
    database: client,
    linkableRemdoServers,
    secret: 'test-better-auth-secret-0123456789',
  });
  const registry = createDocumentRegistry({ client });
  const collabDocuments = new Map<string, Uint8Array>();
  const tokenManager: YSweetDocumentTokenManager = {
    async getDocAsUpdate(docId) {
      return collabDocuments.get(docId) ?? Y.encodeStateAsUpdate(new Y.Doc());
    },
    async getOrCreateDocAndToken(docId, authDocRequest) {
      if (!collabDocuments.has(docId)) {
        collabDocuments.set(docId, Y.encodeStateAsUpdate(new Y.Doc()));
      }
      return {
        authorization: authDocRequest?.authorization,
        baseUrl: `http://collab-token.test.invalid/d/${docId}`,
        docId,
        url: `ws://collab-token.test.invalid/d/${docId}`,
      };
    },
    async updateDoc(docId, update) {
      await onUpdateDoc?.(docId, update);
      const doc = new Y.Doc();
      const existing = collabDocuments.get(docId);
      if (existing) {
        Y.applyUpdate(doc, existing);
      }
      Y.applyUpdate(doc, update);
      collabDocuments.set(docId, Y.encodeStateAsUpdate(doc));
      doc.destroy();
    },
  };
  const app = createServerApp({
    adminSecret,
    auth,
    tokenManager,
    registry,
    logError: () => {},
  });

  return {
    app,
    auth,
    database: client,
    registry,
    async createSessionHeaders(user: CreateAuthUserInput = TEST_USER) {
      await auth.ensureReady();
      const provisionResponse = await app.request('/api/admin/users', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...user,
          adminSecret: TEST_ADMIN_SECRET,
        }),
      });
      const response = provisionResponse.ok
        ? provisionResponse
        : await app.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: user.email,
            password: user.password,
          }),
        });

      return new Headers({
        cookie: extractSessionCookie(response),
      });
    },
    async getSessionUserId(headers: Headers) {
      const session = await auth.getSession(headers);
      if (!session?.user) {
        throw new Error('Expected Better Auth session user.');
      }
      return session.user.id;
    },
    readProjectedDocumentIds(docId: string) {
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, collabDocuments.get(docId) ?? Y.encodeStateAsUpdate(new Y.Doc()));
        const documents = doc.getMap<Y.Array<Y.Map<unknown>>>('user-data').get('documents');
        return documents instanceof Y.Array
          ? documents.toArray().map((entry) => String(entry.get('id')))
          : [];
      } finally {
        doc.destroy();
      }
    },
    async cleanup() {
      await client.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
