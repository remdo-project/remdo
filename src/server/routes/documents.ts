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

interface DocumentAccessView {
  documentId: string;
  email: string;
  granteeUserId: string;
  name: string | null;
}

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

  routes.get('/:docId/access', async (c) => {
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
      if (!document || document.ownerUserId !== actor.userId) {
        return c.json({ error: 'Document not found.' }, HTTP_STATUS.NOT_FOUND);
      }
      if (document.kind !== 'document') {
        return c.json({ error: 'Document cannot be shared.' }, HTTP_STATUS.BAD_REQUEST);
      }

      const grants = await registry.listDocumentAccessForOwner(normalizedDocId, actor.userId);
      const users = await auth.listUsersByIds(grants.map((grant) => grant.granteeUserId));
      const usersById = new Map(users.map((user) => [user.id, user]));
      const access = grants.flatMap<DocumentAccessView>((grant) => {
        const user = usersById.get(grant.granteeUserId);
        if (!user) {
          return [];
        }
        return [{
          documentId: grant.documentId,
          email: user.email,
          granteeUserId: grant.granteeUserId,
          name: user.name,
        }];
      });
      return c.json({ access });
    } catch (error) {
      logError(error, { docId: normalizedDocId });
      return c.json({ error: 'Failed to list document access.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  routes.post('/:docId/access', async (c) => {
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
      if (!document || document.ownerUserId !== actor.userId) {
        return c.json({ error: 'Document not found.' }, HTTP_STATUS.NOT_FOUND);
      }
      if (document.kind !== 'document') {
        return c.json({ error: 'Document cannot be shared.' }, HTTP_STATUS.BAD_REQUEST);
      }
      const body = await c.req.json<{ email?: string }>();
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (!email) {
        return c.json({ error: 'Email is required.' }, HTTP_STATUS.BAD_REQUEST);
      }
      const user = await auth.findUserByEmail(email);
      if (!user) {
        return c.json({ error: 'User not found.' }, HTTP_STATUS.NOT_FOUND);
      }
      if (user.id === actor.userId) {
        return c.json({ error: 'Owners cannot share documents with themselves.' }, HTTP_STATUS.BAD_REQUEST);
      }

      const grant = await registry.grantDocumentAccess(document.id, actor.userId, user.id);
      if (!grant) {
        return c.json({ error: 'Document not found.' }, HTTP_STATUS.NOT_FOUND);
      }
      await refreshCurrentUserDocumentsProjectionBestEffort(registry, tokenManager, user.id);
      return c.json({
        access: {
          documentId: grant.documentId,
          email: user.email,
          granteeUserId: grant.granteeUserId,
          name: user.name,
        },
      });
    } catch (error) {
      logError(error, { docId: normalizedDocId });
      return c.json({ error: 'Failed to share document.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
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
        hasDocumentAccess: async (documentId, granteeUserId) => (
          await registry.getDocumentAccessForGrantee(documentId, granteeUserId)
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
