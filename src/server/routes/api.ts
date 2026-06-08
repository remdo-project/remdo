import { Hono } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import { createAdminRoutes } from './admin';
import { createCurrentUserRoutes } from './current-user';
import { createDocumentRoutes } from './documents';
import type { ServerRouteDependencies } from './types';

export function createApiRoutes(dependencies: ServerRouteDependencies) {
  const routes = new Hono();

  routes.get('/health', async (c) => {
    await dependencies.auth.ensureReady();
    return c.json({ ok: true });
  });

  routes.route('/current-user', createCurrentUserRoutes(dependencies));
  routes.route('/documents', createDocumentRoutes(dependencies));
  routes.route('/admin', createAdminRoutes(dependencies));

  routes.notFound((c) => c.json({ error: 'API route not found.' }, HTTP_STATUS.NOT_FOUND));

  return routes;
}
