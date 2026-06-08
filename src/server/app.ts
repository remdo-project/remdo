import { Hono } from 'hono';
import { config } from '#config';
import type { ServerAuth } from './auth/auth';
import { createYSweetDocumentTokenManager } from './collab-token';
import type { YSweetDocumentTokenManager } from './collab-token';
import type { DocumentRegistry } from './documents/document-registry';
import { createApiRoutes } from './routes/api';
import { createAuthRoutes } from './routes/auth';
import { createWellKnownRoutes } from './routes/well-known';

interface ServerAppOptions {
  adminSecret?: string;
  auth: ServerAuth;
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
  tokenManager = createYSweetDocumentTokenManager(),
  registry,
  logError = defaultLogError,
}: ServerAppOptions) {
  const app = new Hono();
  const dependencies = {
    adminSecret,
    auth,
    logError,
    registry,
    tokenManager,
  };

  app.route('/api/auth', createAuthRoutes(dependencies));
  app.route('/.well-known', createWellKnownRoutes(dependencies));
  app.route('/api', createApiRoutes(dependencies));

  return app;
}
