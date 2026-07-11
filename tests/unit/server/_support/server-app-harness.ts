import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deriveAuthTrustedOrigins } from '#config/env/auth-origins';
import { createServerApp } from '#server/app';
import {
  createServerAuth,
  createSwappableServerAuth,
} from '#server/auth/auth';
import type { CreateAuthUserInput } from '#server/auth/auth';
import { extractSessionCookie } from '#server/auth/session-cookie';
import type { YSweetDocumentTokenManager } from '#server/collab-token';
import { createServerDatabaseClient } from '#server/db/client';
import type { StoredSourceServer } from '#server/remdo-oauth/source-server-store';
import { createDocumentRegistry } from '#server/documents/document-registry';
import * as Y from 'yjs';

const TEST_USER = {
  email: 'server@example.com',
  name: 'Server Test User',
  password: 'server-password-1234',
} as const;
export const TEST_ADMIN_SECRET = 'test-admin-secret-0123456789';
// The harness's own canonical origin — an explicit override, deliberately not the
// env AUTH_URL, so tests exercise instance-scoped baseURL wiring.
const TEST_BASE_URL = 'http://127.0.0.1:4000';
// Fixed preview port for the harness's trusted origins, so the derived list is
// deterministic and independent of the env-derived PREVIEW_PORT.
export const TEST_PREVIEW_PORT = 4005;

export function createServerAppHarness({
  adminSecret = TEST_ADMIN_SECRET,
  allowSignup = false,
  baseURL = TEST_BASE_URL,
  sourceServers = [],
  swappableAuth = false,
  onUpdateDoc,
}: {
  adminSecret?: string;
  allowSignup?: boolean;
  baseURL?: string;
  sourceServers?: readonly StoredSourceServer[];
  swappableAuth?: boolean;
  onUpdateDoc?: (docId: string, update: Uint8Array) => void | Promise<void>;
} = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-server-auth-'));
  const dbPath = path.join(tempDir, 'remdo.sqlite');
  const client = createServerDatabaseClient({ dbPath });
  // Derive trusted origins from the harness's own baseURL (not the env singleton)
  // so the auth instance honours the baseURL it was given.
  const trustedOrigins = deriveAuthTrustedOrigins({
    baseURL,
    isProduction: false,
    hostname: 'test-host',
    previewPort: TEST_PREVIEW_PORT,
  });
  const authOptions = {
    allowSignup,
    baseURL,
    database: client,
    sourceServers,
    secret: 'test-better-auth-secret-0123456789',
    trustedOrigins,
  };
  const swappable = swappableAuth
    ? createSwappableServerAuth(authOptions)
    : null;
  const auth = swappable?.auth ?? createServerAuth(authOptions);
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
    database: client,
    rebuildAuth: swappable?.rebuild,
    tokenManager,
    registry,
    logError: () => {},
  });

  return {
    app,
    auth,
    trustedOrigins,
    database: client,
    registry,
    async createSessionHeaders(user: CreateAuthUserInput = TEST_USER) {
      await auth.ensureReady();
      // Self-enrollment is the secret-gated account-creation path that works with
      // signup disabled; it also grants the admin role. Test users are therefore
      // admins, which is irrelevant to the ownership/grant behaviors these
      // sessions exercise. Role-gating tests create their own non-admin users.
      const provisionResponse = await app.request('/api/admin/enroll', {
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
    readProjectedDocumentAccess(docId: string, targetDocumentId: string) {
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, collabDocuments.get(docId) ?? Y.encodeStateAsUpdate(new Y.Doc()));
        const documents = doc.getMap<Y.Array<Y.Map<unknown>>>('user-data').get('documents');
        if (!(documents instanceof Y.Array)) {
          return [];
        }
        let document: Y.Map<unknown> | undefined;
        for (const entry of documents) {
          if (entry.get('id') === targetDocumentId) {
            document = entry;
            break;
          }
        }
        const access = document?.get('access');
        return access instanceof Y.Array
          ? access.toArray().map((entry) => ({
            documentId: String(entry.get('documentId')),
            email: String(entry.get('email')),
            granteeUserId: String(entry.get('granteeUserId')),
            name: entry.get('name') === null ? null : String(entry.get('name')),
          }))
          : [];
      } finally {
        doc.destroy();
      }
    },
    readProjectedSourceServers(docId: string) {
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, collabDocuments.get(docId) ?? Y.encodeStateAsUpdate(new Y.Doc()));
        const sourceServers = doc.getMap<Y.Array<Y.Map<unknown>>>('user-data').get('source-servers');
        return sourceServers instanceof Y.Array
          ? sourceServers.toArray().map((entry) => ({
            id: String(entry.get('id')),
            label: String(entry.get('label')),
            baseUrl: String(entry.get('baseUrl')),
          }))
          : [];
      } finally {
        doc.destroy();
      }
    },
    async cleanup() {
      await auth.ensureReady();
      await client.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
