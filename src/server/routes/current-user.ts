import { Hono } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import { requireActorResolution } from '#server/auth/actor';
import { ensureCurrentUserBootstrap } from '#server/documents/current-user';
import { listCurrentUserSourceServers } from '#server/documents/source-servers';
import { createSourceLinkRoutes } from './source-links';
import { createSourceServerRoutes } from './source-servers';
import type { ServerRouteDependencies } from './types';

export function createCurrentUserRoutes(dependencies: ServerRouteDependencies) {
  const {
    auth,
    logError,
    registry,
    tokenManager,
  } = dependencies;
  const routes = new Hono();

  routes.get('/', async (c) => {
    try {
      const actorResolution = await requireActorResolution(c, auth);
      if (actorResolution instanceof Response) {
        return actorResolution;
      }

      const bootstrap = await ensureCurrentUserBootstrap(registry, tokenManager, actorResolution.actor.userId, {
        auth,
        sourceServers: actorResolution.credential === 'bearer'
          ? undefined
          : await listCurrentUserSourceServers(auth, c.req.raw.headers),
      });

      return c.json(bootstrap);
    } catch (error) {
      logError(error, {});
      return c.json({ error: 'Failed to resolve current user.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });
  routes.route('/source-servers', createSourceServerRoutes(dependencies));
  routes.route('/', createSourceLinkRoutes(dependencies));

  return routes;
}
