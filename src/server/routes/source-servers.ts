import { Hono } from 'hono';
import { normalizeDocumentId } from '#domain/documents/ids';
import { HTTP_STATUS } from '#platform/http/status';
import { REMDO_SERVER_OAUTH_SCOPES } from '#server/auth/auth';
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

function resolveSourceServerApiOrigin(server: { baseUrl: string; tokenBaseUrl?: string }): string {
  return server.tokenBaseUrl ?? server.baseUrl;
}

function createSourceServerBrowserOriginHeaders(server: { baseUrl: string }): HeadersInit {
  const browserVisibleUrl = new URL(server.baseUrl);
  return {
    'content-type': 'application/json',
    'x-forwarded-host': browserVisibleUrl.host,
    'x-forwarded-proto': browserVisibleUrl.protocol.slice(0, -1),
  };
}

export function createSourceServerRoutes({
  auth,
  logError,
}: ServerRouteDependencies) {
  const routes = new Hono();

  async function resolveSourceAccess(request: Request, serverId: string) {
    const server = auth.linkableRemdoServers.find((candidate) => candidate.id === serverId);
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

  routes.get('/:serverId/current-user', async (c) => {
    try {
      const access = await resolveSourceAccess(c.req.raw, c.req.param('serverId'));
      if (access.kind === 'not-found') {
        return c.json({ error: 'Source server not found.' }, HTTP_STATUS.NOT_FOUND);
      }
      if (access.kind === 'unauthorized') {
        return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
      }
      if (access.kind === 'forbidden') {
        return c.json({ error: 'Source server account is not linked.' }, HTTP_STATUS.FORBIDDEN);
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
      const access = await resolveSourceAccess(c.req.raw, c.req.param('serverId'));
      if (access.kind === 'not-found') {
        return c.json({ error: 'Source server not found.' }, HTTP_STATUS.NOT_FOUND);
      }
      if (access.kind === 'unauthorized') {
        return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
      }
      if (access.kind === 'forbidden') {
        return c.json({ error: 'Source server account is not linked.' }, HTTP_STATUS.FORBIDDEN);
      }

      const response = await fetch(`${resolveSourceServerApiOrigin(access.server)}/api/documents/${
        encodeURIComponent(normalizedDocId)
      }/sync-tokens`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          ...createSourceServerBrowserOriginHeaders(access.server),
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
    const server = auth.linkableRemdoServers.find((candidate) => candidate.id === serverId);
    if (!server) {
      return c.json({ error: 'Source server not found.' }, HTTP_STATUS.NOT_FOUND);
    }

    try {
      await auth.ensureReady();
      const actor = await resolveActor(c.req.raw, auth);
      if (!actor) {
        return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
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
