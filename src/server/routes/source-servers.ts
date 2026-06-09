import { Hono } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import { REMDO_SERVER_OAUTH_SCOPES } from '#server/auth/auth';
import { resolveActor } from '#server/auth/actor';
import { acceptsSourceServerLinkMutation } from './request-guards';
import type { ServerRouteDependencies } from './types';

export function createSourceServerRoutes({
  auth,
  logError,
}: ServerRouteDependencies) {
  const routes = new Hono();

  routes.post('/:serverId/account-links', async (c) => {
    const serverId = c.req.param('serverId');
    const server = auth.linkableRemdoServers.find((candidate) => candidate.id === serverId);
    if (!server) {
      return c.json({ error: 'Source server not found.' }, HTTP_STATUS.NOT_FOUND);
    }
    if (!acceptsSourceServerLinkMutation(c.req.raw)) {
      return c.json({ error: 'Invalid source server link request.' }, HTTP_STATUS.BAD_REQUEST);
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
