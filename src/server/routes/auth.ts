import { Hono } from 'hono';
import type { ServerRouteDependencies } from './types';

export function createAuthRoutes({ auth }: ServerRouteDependencies) {
  const routes = new Hono();

  routes.all('/*', async (c) => {
    await auth.ensureReady();
    return auth.auth.handler(c.req.raw);
  });

  return routes;
}
