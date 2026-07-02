import { Hono } from 'hono';
import type { Context } from 'hono';
import { normalizeDocumentId } from '#domain/documents/ids';
import { HTTP_STATUS } from '#platform/http/status';
import { REMDO_SERVER_OAUTH_SCOPES } from '#server/auth/auth';
import { requireActor, resolveActor } from '#server/auth/actor';
import type { ServerRouteDependencies } from './types';

// Upstream auth/access/not-found responses describe a recoverable user state
// (re-link, no grant, unknown doc), not a home-server fault. Forward those
// statuses so the browser can tell them apart; map anything else to 500.
const FORWARDED_SOURCE_ERROR_STATUSES = new Set<number>([
  HTTP_STATUS.UNAUTHORIZED,
  HTTP_STATUS.FORBIDDEN,
  HTTP_STATUS.NOT_FOUND,
]);

function resolveSourceErrorStatus(upstreamStatus: number): 401 | 403 | 404 | 500 {
  return FORWARDED_SOURCE_ERROR_STATUSES.has(upstreamStatus)
    ? (upstreamStatus as 401 | 403 | 404)
    : HTTP_STATUS.INTERNAL_SERVER_ERROR;
}

function resolveSourceServerApiOrigin(server: { baseUrl: string }): string {
  return server.baseUrl;
}

export function createSourceServerRoutes({
  auth,
  logError,
}: ServerRouteDependencies) {
  const routes = new Hono();

  async function resolveSourceAccess(request: Request, serverId: string) {
    const server = auth.sourceServers.find((candidate) => candidate.id === serverId);
    if (!server) {
      return { kind: 'not-found' as const };
    }
    await auth.ensureReady();
    const actor = await resolveActor(request, auth);
    if (!actor) {
      return { kind: 'unauthorized' as const };
    }
    const accessToken = await auth.getLinkedRemdoServerAccessToken(actor.userId, server.id);
    if (!accessToken) {
      return { kind: 'forbidden' as const };
    }
    return { accessToken, kind: 'ready' as const, server };
  }

  type SourceAccess = Awaited<ReturnType<typeof resolveSourceAccess>>;
  type ReadySourceAccess = Extract<SourceAccess, { kind: 'ready' }>;

  // Resolves access and either returns the ready grant or sends the matching
  // error response for the non-ready states shared across source routes.
  async function requireSourceAccess(
    c: Context,
    serverId: string,
  ): Promise<ReadySourceAccess | Response> {
    const access = await resolveSourceAccess(c.req.raw, serverId);
    switch (access.kind) {
      case 'not-found':
        return c.json({ error: 'Source server not found.' }, HTTP_STATUS.NOT_FOUND);
      case 'unauthorized':
        return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
      case 'forbidden':
        return c.json({ error: 'Source server account is not linked.' }, HTTP_STATUS.FORBIDDEN);
      default:
        return access;
    }
  }

  routes.get('/:serverId/current-user', async (c) => {
    try {
      const access = await requireSourceAccess(c, c.req.param('serverId'));
      if (access instanceof Response) {
        return access;
      }

      const response = await fetch(`${resolveSourceServerApiOrigin(access.server)}/api/current-user`, {
        headers: {
          authorization: `Bearer ${access.accessToken}`,
        },
      });
      if (!response.ok) {
        return c.json(
          { error: `Source server bootstrap failed: ${response.status}` },
          resolveSourceErrorStatus(response.status),
        );
      }
      return c.json(await response.json());
    } catch (error) {
      logError(error, {});
      return c.json({ error: 'Failed to load source server current user.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  routes.post('/:serverId/documents/:docId/sync-tokens', async (c) => {
    const normalizedDocId = normalizeDocumentId(c.req.param('docId'));
    if (!normalizedDocId) {
      return c.json({ error: 'Invalid document id.' }, HTTP_STATUS.BAD_REQUEST);
    }

    try {
      const access = await requireSourceAccess(c, c.req.param('serverId'));
      if (access instanceof Response) {
        return access;
      }

      const response = await fetch(`${resolveSourceServerApiOrigin(access.server)}/api/documents/${
        encodeURIComponent(normalizedDocId)
      }/sync-tokens`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ docId: normalizedDocId }),
      });
      if (!response.ok) {
        return c.json(
          { error: `Source server sync token failed: ${response.status}` },
          resolveSourceErrorStatus(response.status),
        );
      }
      return c.json(await response.json());
    } catch (error) {
      logError(error, { docId: normalizedDocId });
      return c.json({ error: 'Failed to issue source server Y-Sweet document client token.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  routes.post('/:serverId/account-links', async (c) => {
    const serverId = c.req.param('serverId');
    const server = auth.sourceServers.find((candidate) => candidate.id === serverId);
    if (!server) {
      return c.json({ error: 'Source server not found.' }, HTTP_STATUS.NOT_FOUND);
    }

    try {
      const actor = await requireActor(c, auth);
      if (actor instanceof Response) {
        return actor;
      }

      return auth.auth.api.oAuth2LinkAccount({
        body: {
          providerId: server.id,
          callbackURL: '/sharing',
          scopes: [...REMDO_SERVER_OAUTH_SCOPES],
        },
        headers: c.req.raw.headers,
        asResponse: true,
      });
    } catch (error) {
      logError(error, {});
      return c.json({ error: 'Failed to link source server account.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  return routes;
}
