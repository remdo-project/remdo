import { resolveSessionGateState } from '#client/app/session/client';
import type { SessionGateState } from '#client/app/session/client';

// What `/admin` should render, resolved from the caller's session + role.
export type AdminRouteState =
  | { kind: 'admin'; sessionState: SessionGateState }
  | { kind: 'enroll'; sessionState: SessionGateState };

// `/admin` is the single admin entry route (see
// docs/specs/access/access-control.md#admin-role):
//   - admin → the admin panel (placeholder until panel content exists);
//   - anyone else (signed in or not) → the register-and-enroll form, which
//     creates a new admin account. Promoting an existing user is a later,
//     panel-gated capability.
// Authorization stays server-side; this only chooses what to render.
export async function adminRouteLoader(): Promise<AdminRouteState> {
  const session = await resolveSessionGateState();
  if (session.status !== 'authenticated') {
    return { kind: 'enroll', sessionState: session };
  }
  return session.session.user.role === 'admin'
    ? { kind: 'admin', sessionState: session }
    : { kind: 'enroll', sessionState: session };
}
