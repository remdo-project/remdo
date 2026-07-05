import { createServerApp } from './app';
import { createSwappableServerAuth } from './auth/auth';
import type { ServerAuth } from './auth/auth';
import { createYSweetDocumentTokenManager } from './collab-token';
import type { YSweetDocumentTokenManager } from './collab-token';
import { createServerDatabaseClient } from './db/client';
import type { SqliteServerDatabaseClient } from './db/client';
import { createDocumentRegistry } from './documents/document-registry';
import type { DocumentRegistry } from './documents/document-registry';
import type { StoredSourceServer } from './remdo-oauth/source-server-store';

interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

interface ServerRuntimeOptions {
  adminSecret?: string;
  allowSignup?: boolean;
  baseURL?: string;
  dbPath?: string;
  sourceServers?: readonly StoredSourceServer[];
  logError?: (error: unknown, details: { docId?: string }) => void;
  oauthClientCredentials?: OAuthClientCredentials;
  secret?: string;
  tokenManager?: YSweetDocumentTokenManager;
}

interface ServerRuntime {
  app: ReturnType<typeof createServerApp>;
  auth: ServerAuth;
  close: () => Promise<void>;
  database: SqliteServerDatabaseClient;
  registry: DocumentRegistry;
  tokenManager: YSweetDocumentTokenManager;
}

export function createServerRuntime({
  adminSecret,
  allowSignup,
  baseURL,
  dbPath,
  sourceServers,
  logError,
  oauthClientCredentials,
  secret,
  tokenManager = createYSweetDocumentTokenManager(),
}: ServerRuntimeOptions = {}): ServerRuntime {
  const database = createServerDatabaseClient({ dbPath });
  // Swappable so a source registered this session becomes a live OAuth provider
  // without a restart (register-home calls rebuildAuth after persisting creds).
  const swappableAuth = createSwappableServerAuth({
    allowSignup,
    baseURL,
    database,
    sourceServers,
    oauthClientCredentials,
    secret,
  });
  const auth = swappableAuth.auth;
  const registry = createDocumentRegistry({ client: database });
  const app = createServerApp({
    adminSecret,
    auth,
    database,
    logError,
    rebuildAuth: swappableAuth.rebuild,
    registry,
    tokenManager,
  });

  return {
    app,
    auth,
    database,
    registry,
    tokenManager,
    close() {
      return database.close();
    },
  };
}
