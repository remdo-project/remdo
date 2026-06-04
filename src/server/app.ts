import { Hono } from 'hono';
import { config } from '#config';
import { HTTP_STATUS } from '#lib/http/status';
import { normalizeDocumentId } from '@/routing';
import type { ServerAuth } from './auth/auth';
import { getServerAuth } from './auth/auth';
import { resolveActor } from './auth/actor';
import { createDocumentRegistry } from './documents/document-registry';
import type { DocumentRegistry } from './documents/document-registry';
import {
  createUserDocument,
  ensureCurrentUserBootstrap,
  refreshCurrentUserDocumentsProjection,
} from './documents/current-user';
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

function readForwardedHeader(headers: Headers, name: string): string | null {
  return headers.get(name)?.split(',')[0]?.trim() || null;
}

function resolveRequestOrigin(request: Request): string {
  const forwardedProto = readForwardedHeader(request.headers, 'x-forwarded-proto');
  const forwardedHost = readForwardedHeader(request.headers, 'x-forwarded-host');
  if (forwardedProto && forwardedHost) {
    return new URL(`${forwardedProto}://${forwardedHost}`).origin;
  }
  return new URL(request.url).origin;
}

function hasJsonContentType(request: Request): boolean {
  return request.headers.get('content-type')?.toLowerCase().split(';')[0]?.trim() === 'application/json';
}

function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === resolveRequestOrigin(request);
}

function acceptsSharingMutation(request: Request): boolean {
  return hasJsonContentType(request)
    && request.headers.get('x-remdo-action') === 'sharing'
    && isSameOriginMutation(request);
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

  app.get('/api/me', async (c) => {
    try {
      await auth.ensureReady();
      const actor = await resolveActor(c.req.raw, auth);
      if (!actor) {
        return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
      }

      const bootstrap = await ensureCurrentUserBootstrap(registry, tokenManager, actor.userId);

      return c.json(bootstrap);
    } catch (error) {
      logError(error, {});
      return c.json({ error: 'Failed to resolve current user.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  app.post('/api/documents', async (c) => {
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

      const document = await createUserDocument(
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

  app.patch('/api/documents/:docId/access-mode', async (c) => {
    const normalizedDocId = normalizeDocumentId(c.req.param('docId'));
    if (!normalizedDocId) {
      return c.json({ error: 'Invalid document id.' }, HTTP_STATUS.BAD_REQUEST);
    }
    if (!acceptsSharingMutation(c.req.raw)) {
      return c.json({ error: 'Invalid sharing request.' }, HTTP_STATUS.BAD_REQUEST);
    }

    try {
      await auth.ensureReady();
      const actor = await resolveActor(c.req.raw, auth);
      if (!actor) {
        return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
      }
      const body = await c.req.json<{ accessMode?: string }>();
      if (body.accessMode !== 'private' && body.accessMode !== 'shareable') {
        return c.json({ error: 'Invalid access mode.' }, HTTP_STATUS.BAD_REQUEST);
      }

      const existingDocument = await registry.getDocument(normalizedDocId);
      if (!existingDocument || existingDocument.ownerUserId !== actor.userId) {
        return c.json({ error: 'Document not found.' }, HTTP_STATUS.NOT_FOUND);
      }
      if (existingDocument.kind !== 'document' && body.accessMode === 'shareable') {
        return c.json({ error: 'Document cannot be shared.' }, HTTP_STATUS.BAD_REQUEST);
      }

      const document = await registry.setDocumentAccessMode(normalizedDocId, actor.userId, body.accessMode);
      return c.json(document);
    } catch (error) {
      logError(error, { docId: normalizedDocId });
      return c.json({ error: 'Failed to update document access mode.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  app.get('/api/documents/:docId/access-requests', async (c) => {
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
      const requests = await registry.listDocumentAccessForOwner(normalizedDocId, actor.userId);
      return c.json({ requests });
    } catch (error) {
      logError(error, { docId: normalizedDocId });
      return c.json({ error: 'Failed to list document access requests.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  app.post('/api/documents/:docId/access-requests', async (c) => {
    const normalizedDocId = normalizeDocumentId(c.req.param('docId'));
    if (!normalizedDocId) {
      return c.json({ error: 'Invalid document id.' }, HTTP_STATUS.BAD_REQUEST);
    }
    if (!acceptsSharingMutation(c.req.raw)) {
      return c.json({ error: 'Invalid sharing request.' }, HTTP_STATUS.BAD_REQUEST);
    }

    try {
      await auth.ensureReady();
      const actor = await resolveActor(c.req.raw, auth);
      if (!actor) {
        return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
      }
      const document = await registry.getDocument(normalizedDocId);
      if (!document || document.accessMode !== 'shareable') {
        return c.json({ error: 'Document access denied.' }, HTTP_STATUS.FORBIDDEN);
      }
      if (document.ownerUserId === actor.userId) {
        return c.json({ error: 'Owners do not need access requests.' }, HTTP_STATUS.BAD_REQUEST);
      }

      const request = await registry.upsertDocumentAccess({
        documentId: document.id,
        requesterUserId: actor.userId,
      });
      return c.json({ request, title: document.title });
    } catch (error) {
      logError(error, { docId: normalizedDocId });
      return c.json({ error: 'Failed to create document access request.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  app.post('/api/documents/:docId/access-requests/:requesterUserId/approve', async (c) => {
    const normalizedDocId = normalizeDocumentId(c.req.param('docId'));
    const requesterUserId = c.req.param('requesterUserId');
    if (!normalizedDocId || !requesterUserId) {
      return c.json({ error: 'Invalid access request.' }, HTTP_STATUS.BAD_REQUEST);
    }
    if (!acceptsSharingMutation(c.req.raw)) {
      return c.json({ error: 'Invalid sharing request.' }, HTTP_STATUS.BAD_REQUEST);
    }

    try {
      await auth.ensureReady();
      const actor = await resolveActor(c.req.raw, auth);
      if (!actor) {
        return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
      }
      const request = await registry.approveDocumentAccess(
        normalizedDocId,
        requesterUserId,
        actor.userId,
      );
      if (!request) {
        return c.json({ error: 'Access request not found.' }, HTTP_STATUS.NOT_FOUND);
      }
      try {
        await refreshCurrentUserDocumentsProjection(registry, tokenManager, requesterUserId);
      } catch {
        // SQL is the durable source of truth. A later bootstrap load or document
        // create can repair the derived requester projection.
      }
      return c.json({ request });
    } catch (error) {
      logError(error, { docId: normalizedDocId });
      return c.json({ error: 'Failed to approve document access request.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
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

      const document = await registry.getDocument(normalizedDocId);
      if (!document) {
        return c.json({ error: 'Document not found.' }, HTTP_STATUS.NOT_FOUND);
      }
      const result = await issueDocumentToken(tokenManager, actor, document, c.req.raw, {
        hasApprovedAccess: async (documentId, requesterUserId) => (
          await registry.getApprovedAccessForRequester(documentId, requesterUserId)
        ) !== null,
      });
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
