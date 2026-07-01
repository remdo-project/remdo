import { resolveSessionGateState } from '#client/app/auth/client';
import { getCurrentUserBootstrap } from '#client/app/documents/current-user-bootstrap';

// What `/admin` should render, resolved from the caller's session + role.
export type AdminRouteState =
  | { kind: 'admin' }
  | { kind: 'enroll' };

// `/admin` is the single admin entry route (see docs/access-model.md#admin-role):
//   - admin → the admin panel (placeholder until panel content exists);
//   - anyone else (signed in or not) → the register-and-enroll form, which
//     creates a new admin account. Promoting an existing user is a later,
//     panel-gated capability.
// Authorization stays server-side; this only chooses what to render.
export async function adminRouteLoader(): Promise<AdminRouteState> {
  const session = await resolveSessionGateState();
  if (session.status !== 'authenticated') {
    return { kind: 'enroll' };
  }
  try {
    const bootstrap = await getCurrentUserBootstrap();
    return bootstrap.role === 'admin' ? { kind: 'admin' } : { kind: 'enroll' };
  } catch {
    // If the bootstrap cannot be read, show the enroll form — the server still
    // gates the action on the secret.
    return { kind: 'enroll' };
  }
}
