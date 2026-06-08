import { Hono } from 'hono';
import { normalizeDocumentId } from '#domain/documents/ids';
import { HTTP_STATUS } from '#platform/http/status';
import { resolveActor } from '#server/auth/actor';
import { issueYSweetDocumentClientToken } from '#server/collab-token';
import {
  createUserDocument,
  refreshCurrentUserDocumentsProjectionBestEffort,
} from '#server/documents/current-user';
import { acceptsSharingMutation } from './request-guards';
import type { ServerRouteDependencies } from './types';

export function createDocumentRoutes({
  auth,
  logError,
  registry,
  tokenManager,
}: ServerRouteDependencies) {
  const routes = new Hono();

  routes.post('/', async (c) => {
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

  routes.patch('/:docId/sharing', async (c) => {
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

      const affectedRequesterIds = (await registry.listDocumentAccessForOwner(normalizedDocId, actor.userId))
        .filter((request) => request.status === 'approved')
        .map((request) => request.requesterUserId);
      const document = await registry.setDocumentAccessMode(normalizedDocId, actor.userId, body.accessMode);
      if (document) {
        await Promise.all(affectedRequesterIds.map(async (requesterUserId) => {
          await refreshCurrentUserDocumentsProjectionBestEffort(registry, tokenManager, requesterUserId);
        }));
      }
      return c.json(document);
    } catch (error) {
      logError(error, { docId: normalizedDocId });
      return c.json({ error: 'Failed to update document access mode.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  routes.get('/:docId/access-requests', async (c) => {
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

  routes.post('/:docId/access-requests', async (c) => {
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

  routes.post('/:docId/access-requests/:requesterUserId/approval', async (c) => {
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
      await refreshCurrentUserDocumentsProjectionBestEffort(registry, tokenManager, requesterUserId);
      return c.json({ request });
    } catch (error) {
      logError(error, { docId: normalizedDocId });
      return c.json({ error: 'Failed to approve document access request.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  routes.post('/:docId/sync-tokens', async (c) => {
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
      const result = await issueYSweetDocumentClientToken(tokenManager, actor, document, c.req.raw, {
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
      return c.json({ error: 'Failed to issue Y-Sweet document client token.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  return routes;
}
