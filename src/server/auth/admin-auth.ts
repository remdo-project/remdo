import type { ServerAuth } from './auth';

// Whether the request's session belongs to a user with the admin role. The role
// is read from the SQL user record (the authorization source of truth), not from
// the session payload, so a stale or forged session field cannot grant admin.
// Returns the admin user's id, or null when there is no admin session.
export async function resolveAdminSessionUserId(
  auth: ServerAuth,
  headers: Headers,
): Promise<string | null> {
  const session = await auth.getSession(headers);
  const userId = session?.user.id;
  if (!userId) {
    return null;
  }
  const role = await auth.getUserRole(userId);
  return role === 'admin' ? userId : null;
}
