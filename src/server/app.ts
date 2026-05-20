import { Hono } from 'hono';
import { config } from '#config';
import { HTTP_STATUS } from '#lib/http/status';
import { normalizeDocumentId } from '@/routing';
import type { ServerAuth } from './auth/auth';
import { getServerAuth } from './auth/auth';
import { resolveActor } from './auth/actor';
import { handleDevLoginRequest } from './auth/dev-login';
import { createDocumentRegistry } from './documents/document-registry';
import type { DocumentRegistry, RegisteredDocument } from './documents/document-registry';
import { createListedProfileDocument, ensureUserProfile } from './documents/user-profile';
import { createDocumentTokenManager, issueDocumentToken } from './collab-token';
import type { DocumentTokenManager } from './collab-token';

interface ServerAppOptions {
  adminSecret?: string;
  auth?: ServerAuth;
  tokenManager?: DocumentTokenManager;
  registry?: DocumentRegistry;
  logError?: (error: unknown, details: { docId?: string }) => void;
}

function defaultLogError(error: unknown, details: { docId?: string }) {
  console.error('[remdo-api] request failed', {
    ...details,
    message: error instanceof Error ? error.message : String(error),
  });
}

async function getOrCreateTokenDocument(
  registry: DocumentRegistry,
  docId: string,
  ownerUserId: string,
): Promise<RegisteredDocument> {
  const existing = await registry.getDocument(docId);
  if (existing) {
    return existing;
  }

  const inserted = await registry.insertDocument({
    id: docId,
    ownerUserId,
    title: docId,
  });
  if (inserted) {
    return inserted;
  }

  const racedDocument = await registry.getDocument(docId);
  if (!racedDocument) {
    throw new Error(`Document registry row missing after insert conflict for ${docId}.`);
  }
  return racedDocument;
}

export function createServerApp({
  adminSecret = config.env.ADMIN_SECRET,
  auth = getServerAuth(),
  tokenManager = createDocumentTokenManager(),
  registry = createDocumentRegistry(),
  logError = defaultLogError,
}: ServerAppOptions = {}) {
  const app = new Hono();

  app.all('/api/auth/*', async (c) => {
    await auth.ensureReady();
    return auth.auth.handler(c.req.raw);
  });

  app.get('/api/health', async (c) => {
    await auth.ensureReady();
    return c.json({
      db: 'ok',
      ok: true,
    });
  });

  app.get('/api/dev/login', async (c) => {
    if (!config.isDev) {
      return c.json({ error: 'Development login is unavailable.' }, HTTP_STATUS.FORBIDDEN);
    }

    return handleDevLoginRequest(auth, c.req.raw);
  });

  app.get('/api/profile', async (c) => {
    try {
      await auth.ensureReady();
      const actor = await resolveActor(c.req.raw, auth);
      if (!actor) {
        return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
      }

      const profile = await ensureUserProfile(registry, tokenManager, actor.userId);

      return c.json(profile);
    } catch (error) {
      logError(error, {});
      return c.json({ error: 'Failed to resolve profile.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  app.post('/api/profile/documents', async (c) => {
    try {
      await auth.ensureReady();
      const actor = await resolveActor(c.req.raw, auth);
      if (!actor) {
        return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
      }

      const body = await c.req.json<{ title?: string }>();
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        return c.json({ error: 'Document title is required.' }, HTTP_STATUS.BAD_REQUEST);
      }

      const document = await createListedProfileDocument(
        registry,
        tokenManager,
        actor.userId,
        title,
      );

      return c.json(document);
    } catch (error) {
      logError(error, {});
      return c.json({ error: 'Failed to create document.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  app.post('/api/admin/users', async (c) => {
    await auth.ensureReady();

    const body = await c.req.json<{
      adminSecret?: string;
      email?: string;
      name?: string;
      password?: string;
    }>();
    if (!adminSecret || body.adminSecret !== adminSecret) {
      return c.json({ error: 'Admin secret is invalid.' }, HTTP_STATUS.FORBIDDEN);
    }

    const trimmedName = typeof body.name === 'string' ? body.name.trim() : '';
    const trimmedEmail = typeof body.email === 'string' ? body.email.trim() : '';
    if (
      trimmedName.length === 0
      || trimmedEmail.length === 0
      || typeof body.password !== 'string' || body.password.length === 0
    ) {
      return c.json({ error: 'Name, email, and password are required.' }, HTTP_STATUS.BAD_REQUEST);
    }

    return auth.createUser({
      name: trimmedName,
      email: trimmedEmail,
      password: body.password,
    }, c.req.raw.headers);
  });

  app.post('/api/documents/:docId/token', async (c) => {
    const normalizedDocId = normalizeDocumentId(c.req.param('docId'));
    if (!normalizedDocId) {
      return c.json({ error: 'Invalid document id.' }, HTTP_STATUS.BAD_REQUEST);
    }

    try {
      await auth.ensureReady();
      const actor = await resolveActor(c.req.raw, auth);
      if (!actor) {
        return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
      }

      const document = await getOrCreateTokenDocument(registry, normalizedDocId, actor.userId);
      const result = await issueDocumentToken(tokenManager, actor, document, c.req.raw);
      if (result.denied) {
        return c.json({ error: 'Document access denied.' }, HTTP_STATUS.FORBIDDEN);
      }

      return c.json(result.token);
    } catch (error) {
      logError(error, { docId: normalizedDocId });
      return c.json({ error: 'Failed to issue document token.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  return app;
}
