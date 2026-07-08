import { Hono } from 'hono';
import type { Context } from 'hono';
import { normalizeDocumentId } from '#domain/documents/ids';
import { HTTP_STATUS } from '#platform/http/status';
import { resolveActor } from '#server/auth/actor';
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

export function createSourceServerRoutes(dependencies: ServerRouteDependencies) {
  const { auth, logError } = dependencies;
  const routes = new Hono();

  async function resolveSourceAccess(request: Request, serverId: string) {
    // Resolve the actor BEFORE touching the source list: source ids derive from
    // origins, and source_servers is a global cache (any user's link adds a row),
    // so an unauthenticated caller must not be able to distinguish a known id
    // (someone linked that origin) from an unknown one via 404-vs-401.
    await auth.ensureReady();
    const actor = await resolveActor(request, auth);
    if (!actor) {
      return { kind: 'unauthorized' as const };
    }
    const server = auth.sourceServers.find((candidate) => candidate.id === serverId);
    if (!server) {
      return { kind: 'not-found' as const };
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

      const response = await fetch(`${access.server.baseUrl}/api/current-user`, {
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

      const response = await fetch(`${access.server.baseUrl}/api/documents/${
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

  return routes;
}
