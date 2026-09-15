import { Hono } from 'hono';
import type { ServerRouteDependencies } from './types';

export function createWellKnownRoutes({ auth }: ServerRouteDependencies) {
  const routes = new Hono();

  routes.get('/openid-configuration', async (c) => {
    return auth.handleOpenIdConfigMetadata(c.req.raw);
  });

  routes.get('/oauth-authorization-server', async (c) => {
    return auth.handleAuthServerMetadata(c.req.raw);
  });

  return routes;
}
