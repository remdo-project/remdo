import { Hono } from 'hono';
import { config } from '#config';
import { HTTP_STATUS } from '#platform/http/status';
import type { ServerAuth } from './auth/auth';
import { createYSweetDocumentTokenManager } from './collab-token';
import type { YSweetDocumentTokenManager } from './collab-token';
import type { SqliteServerDatabaseClient } from './db/client';
import type { DocumentRegistry } from './documents/document-registry';
import { createApiRoutes } from './routes/api';
import { createAuthRoutes } from './routes/auth';
import { createWellKnownRoutes } from './routes/well-known';

interface ServerAppOptions {
  adminSecret?: string;
  auth: ServerAuth;
  database: SqliteServerDatabaseClient;
  rebuildAuth?: () => void;
  tokenManager?: YSweetDocumentTokenManager;
  registry: DocumentRegistry;
  logError?: (error: unknown, details: { docId?: string }) => void;
}

function defaultLogError(error: unknown, details: { docId?: string }) {
  console.error('[remdo-api] request failed', {
    ...details,
    message: error instanceof Error ? error.message : String(error),
  });
}

export function createServerApp({
  adminSecret = config.env.ADMIN_SECRET,
  auth,
  database,
  rebuildAuth = () => {},
  tokenManager = createYSweetDocumentTokenManager(),
  registry,
  logError = defaultLogError,
}: ServerAppOptions) {
  const app = new Hono();
  const dependencies = {
    adminSecret,
    auth,
    database,
    logError,
    rebuildAuth,
    registry,
    tokenManager,
  };

  app.route('/api/auth', createAuthRoutes(dependencies));
  app.route('/.well-known', createWellKnownRoutes(dependencies));
  app.all('/api', (c) => c.json({ error: 'API route not found.' }, HTTP_STATUS.NOT_FOUND));
  app.route('/api', createApiRoutes(dependencies));

  return app;
}
