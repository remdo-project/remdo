import { Hono } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import { resolveAdminSessionUserId } from '#server/auth/admin-auth';
import {
  addSourceServer,
  listSourceServers,
  removeSourceServer,
} from '#server/remdo-oauth/source-server-store';
import type { StoredSourceServer } from '#server/remdo-oauth/source-server-store';
import type { ServerRouteDependencies } from './types';

// Source rows the admin manages may hold a client secret; never expose it to the
// admin panel. The panel only needs identity and whether registration is done.
function toAdminView(server: StoredSourceServer) {
  return {
    id: server.id,
    label: server.label,
    baseUrl: server.baseUrl,
    registered: server.credentials !== null,
  };
}

// Admin-only source-server management behind /admin. Gated by the caller's
// session + admin role (docs/access-model.md#admin-role). Adding a source only
// inserts a credential-less row (no provider, hidden from user linking until it
// is registered), so it needs no auth rebuild; removal rebuilds so the removed
// source's provider stops being usable at once.
export function createSourceServerAdminRoutes({
  auth,
  database,
  rebuildAuth,
  logError,
}: ServerRouteDependencies) {
  const routes = new Hono();

  routes.use('*', async (c, next) => {
    if (!(await resolveAdminSessionUserId(auth, c.req.raw.headers))) {
      return c.json({ error: 'Admin role required.' }, HTTP_STATUS.FORBIDDEN);
    }
    await next();
  });

  routes.get('/', async (c) => {
    const servers = await listSourceServers(database);
    return c.json({ servers: servers.map(toAdminView) });
  });

  routes.post('/', async (c) => {
    const body: { url?: string } = await c.req.json<{ url?: string }>().catch(() => ({}));
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url) {
      return c.json({ error: 'A source server URL is required.' }, HTTP_STATUS.BAD_REQUEST);
    }
    try {
      const added = await addSourceServer(database, url);
      return c.json({ server: toAdminView(added) });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : 'Failed to add the source server.' },
        HTTP_STATUS.BAD_REQUEST,
      );
    }
  });

  routes.post('/:id/remove', async (c) => {
    try {
      await removeSourceServer(database, c.req.param('id'));
      rebuildAuth();
      return c.json({ ok: true });
    } catch (error) {
      logError(error, {});
      return c.json({ error: 'Failed to remove the source server.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  return routes;
}
