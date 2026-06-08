import { Hono } from 'hono';
import type { ServerRouteDependencies } from './types';

export function createWellKnownRoutes({ auth }: ServerRouteDependencies) {
  const routes = new Hono();

  routes.get('/openid-configuration', async (c) => {
    await auth.ensureReady();
    return auth.handleOpenIdConfigMetadata(c.req.raw);
  });

  routes.get('/oauth-authorization-server', async (c) => {
    await auth.ensureReady();
    return auth.handleAuthServerMetadata(c.req.raw);
  });

  return routes;
}
