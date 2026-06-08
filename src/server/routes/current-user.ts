import { Hono } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import { resolveActor } from '#server/auth/actor';
import { ensureCurrentUserBootstrap } from '#server/documents/current-user';
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
  routes.route('/source-servers', createSourceServerRoutes(dependencies));

  return routes;
}
