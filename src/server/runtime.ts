import { createServerApp } from './app';
import { createServerAuth } from './auth/auth';
import type { ServerAuth } from './auth/auth';
import { createYSweetDocumentTokenManager } from './collab-token';
import type { YSweetDocumentTokenManager } from './collab-token';
import { createServerDatabaseClient } from './db/client';
import type { SqliteServerDatabaseClient } from './db/client';
import { createDocumentRegistry } from './documents/document-registry';
import type { DocumentRegistry } from './documents/document-registry';
import type { LinkableRemdoServer } from './remdo-oauth/config';

interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

interface ServerRuntimeOptions {
  adminSecret?: string;
  allowSignup?: boolean;
  baseURL?: string;
  dbPath?: string;
  linkableRemdoServers?: readonly LinkableRemdoServer[];
  logError?: (error: unknown, details: { docId?: string }) => void;
  oauthClientCredentials?: OAuthClientCredentials;
  secret?: string;
  tokenManager?: YSweetDocumentTokenManager;
}

export interface ServerRuntime {
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
  linkableRemdoServers,
  logError,
  oauthClientCredentials,
  secret,
  tokenManager = createYSweetDocumentTokenManager(),
}: ServerRuntimeOptions = {}): ServerRuntime {
  const database = createServerDatabaseClient({ dbPath });
  const auth = createServerAuth({
    allowSignup,
    baseURL,
    database,
    linkableRemdoServers,
    oauthClientCredentials,
    secret,
  });
  const registry = createDocumentRegistry({ client: database });
  const app = createServerApp({
    adminSecret,
    auth,
    logError,
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
