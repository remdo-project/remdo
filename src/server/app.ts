import { Hono } from 'hono';
import { config } from '#config';
import { HTTP_STATUS } from '#platform/http/status';
import type { ServerAuth } from './auth/auth';
import { createYSweetDocumentTokenManager } from './collab-token';
import type { YSweetDocumentTokenManager } from './collab-token';
import type { SqliteServerDatabaseClient } from './db/client';
import { reportServerDiagnostic } from './diagnostics';
import type { ServerDiagnosticReporter } from './diagnostics';
import type { DocumentRegistry } from './documents/document-registry';
import { createApiRoutes } from './routes/api';
import { createAuthRoutes } from './routes/auth';
import { createWellKnownRoutes } from './routes/well-known';

interface ServerAppOptions {
  adminSecret?: string;
  auth: ServerAuth;
  database: SqliteServerDatabaseClient;
  rebuildAuth?: () => Promise<void>;
  tokenManager?: YSweetDocumentTokenManager;
  registry: DocumentRegistry;
  logError?: ServerDiagnosticReporter;
}

export function createServerApp({
  adminSecret = config.env.ADMIN_SECRET,
  auth,
  database,
  rebuildAuth = async () => {},
  tokenManager = createYSweetDocumentTokenManager(),
  registry,
  logError = reportServerDiagnostic,
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
