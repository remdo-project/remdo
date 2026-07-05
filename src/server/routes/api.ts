import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTP_STATUS } from '#platform/http/status';
import { createAdminRoutes } from './admin';
import { createCurrentUserRoutes } from './current-user';
import { createDocumentRoutes } from './documents';
import { createLinkRoutes } from './link';
import { createSourceServerAdminRoutes } from './source-server-admin';
import type { ServerRouteDependencies } from './types';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const JSON_CONTENT_TYPE_PATTERN = /^\s*application\/json\s*(?:;|$)/iu;

function requiresJsonContentType(method: string): boolean {
  return !SAFE_HTTP_METHODS.has(method.toUpperCase());
}

function hasJsonContentType(contentType: string | undefined): boolean {
  return JSON_CONTENT_TYPE_PATTERN.test(contentType ?? '');
}

export function createApiRoutes(dependencies: ServerRouteDependencies) {
  const routes = new Hono();

  routes.use('*', csrf());
  routes.use('*', async (c, next) => {
    if (requiresJsonContentType(c.req.method) && !hasJsonContentType(c.req.header('content-type'))) {
      return c.json({ error: 'JSON content type required.' }, HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE);
    }
    await next();
  });

  routes.get('/health', async (c) => {
    await dependencies.auth.ensureReady();
    return c.json({ ok: true });
  });

  // Unauthenticated public client config: facts the pre-auth UI needs before a
  // session exists (e.g. the login page gating its admin link on signup policy).
  routes.get('/config', (c) => {
    return c.json({ publicServer: dependencies.auth.allowSignup });
  });

  routes.route('/current-user', createCurrentUserRoutes(dependencies));
  routes.route('/documents', createDocumentRoutes(dependencies));
  routes.route('/admin', createAdminRoutes(dependencies));
  routes.route('/admin/source-servers', createSourceServerAdminRoutes(dependencies));
  routes.route('/link', createLinkRoutes(dependencies));

  routes.notFound((c) => c.json({ error: 'API route not found.' }, HTTP_STATUS.NOT_FOUND));

  return routes;
}
