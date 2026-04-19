import { Hono } from 'hono';
import { normalizeDocumentId } from '@/routing';
import { createDocumentManager, issueDocumentToken } from './collab-token';
import type { DocumentTokenManager } from './collab-token';

interface ServerAppOptions {
  manager?: DocumentTokenManager;
  logError?: (error: unknown, details: { docId?: string }) => void;
}

function defaultLogError(error: unknown, details: { docId?: string }) {
  console.error('[remdo-api] request failed', {
    ...details,
    message: error instanceof Error ? error.message : String(error),
  });
}

export function createServerApp({ manager = createDocumentManager(), logError = defaultLogError }: ServerAppOptions = {}) {
  const app = new Hono();

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
    }));

  app.post('/api/documents/:docId/token', async (c) => {
    const normalizedDocId = normalizeDocumentId(c.req.param('docId'));
    if (!normalizedDocId) {
      return c.json({ error: 'Invalid document id.' }, 400);
    }

    try {
      const result = await issueDocumentToken(manager, c.req.raw, normalizedDocId);
      if (result.denied) {
        return c.json({ error: 'Document access denied.' }, 403);
      }

      return c.json(result.token);
    } catch (error) {
      logError(error, { docId: normalizedDocId });
      return c.json({ error: 'Failed to issue document token.' }, 500);
    }
  });

  return app;
}
