import { Hono } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import { secretsMatch } from '#server/auth/secret';
import type { ServerRouteDependencies } from './types';

export function createAdminRoutes({
  adminSecret,
  auth,
}: ServerRouteDependencies) {
  const routes = new Hono();

  // Self-enrollment: the one path to acquire the admin role. Gated by
  // ADMIN_SECRET, never by a session+role (this is how the role is first
  // acquired, so there is no admin session to check — see
  // docs/access-model.md#admin-role). An authenticated caller is promoted in
  // place; an unauthenticated caller registers an account (works even with
  // signup disabled, via the provisioning escape hatch) and is promoted, in one
  // step, so a private server can still bootstrap its first admin.
  routes.post('/enroll', async (c) => {
    await auth.ensureReady();

    const body = await c.req.json<{
      adminSecret?: string;
      email?: string;
      name?: string;
      password?: string;
    }>();
    if (!adminSecret || typeof body.adminSecret !== 'string' || !secretsMatch(adminSecret, body.adminSecret)) {
      return c.json({ error: 'Admin secret is invalid.' }, HTTP_STATUS.FORBIDDEN);
    }

    const session = await auth.getSession(c.req.raw.headers);
    if (session?.user?.id) {
      await auth.grantAdminRole(session.user.id);
      return c.json({ ok: true });
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

    const createResponse = await auth.createUser({
      name: trimmedName,
      email: trimmedEmail,
      password: body.password,
    }, c.req.raw.headers);
    if (!createResponse.ok) {
      return createResponse;
    }

    const created = await auth.findUserByEmail(trimmedEmail);
    if (!created) {
      return c.json({ error: 'Account creation did not persist.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    await auth.grantAdminRole(created.id);
    // Return the create response so its session cookie signs the new admin in.
    return createResponse;
  });

  return routes;
}
