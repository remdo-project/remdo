import { Hono } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import type { ServerRouteDependencies } from './types';

export function createAdminRoutes({
  adminSecret,
  auth,
}: ServerRouteDependencies) {
  const routes = new Hono();

  routes.post('/users', async (c) => {
    await auth.ensureReady();

    const body = await c.req.json<{
      adminSecret?: string;
      email?: string;
      name?: string;
      password?: string;
    }>();
    if (!adminSecret || body.adminSecret !== adminSecret) {
      return c.json({ error: 'Admin secret is invalid.' }, HTTP_STATUS.FORBIDDEN);
    }

    const trimmedName = typeof body.name === 'string' ? body.name.trim() : '';
    const trimmedEmail = typeof body.email === 'string' ? body.email.trim() : '';
    if (
      trimmedName.length === 0
      || trimmedEmail.length === 0
      || typeof body.password !== 'string' || body.password.length === 0
    ) {
      return c.json({ error: 'Name, email, and password are required.' }, HTTP_STATUS.BAD_REQUEST);
    }

    return auth.createUser({
      name: trimmedName,
      email: trimmedEmail,
      password: body.password,
    }, c.req.raw.headers);
  });

  return routes;
}
