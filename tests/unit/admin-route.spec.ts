import { describe, expect, it, vi } from 'vitest';

vi.mock('#client/app/auth/client', () => ({
  resolveSessionGateState: vi.fn(),
}));

describe('adminRouteLoader', () => {
  it('renders the enroll form for an unauthenticated visitor', async () => {
    const { resolveSessionGateState } = await import('#client/app/auth/client');
    vi.mocked(resolveSessionGateState).mockResolvedValue({ status: 'unauthenticated' });
    const { adminRouteLoader } = await import('#client/app/routes/admin-route-loader');
    await expect(adminRouteLoader()).resolves.toEqual({
      kind: 'enroll',
      sessionState: { status: 'unauthenticated' },
    });
  });

  it('renders the panel for an admin and the enroll form for a non-admin', async () => {
    const { resolveSessionGateState } = await import('#client/app/auth/client');
    const adminSession = {
      status: 'authenticated',
      session: { user: { id: 'u1', role: 'admin' } },
    };
    vi.mocked(resolveSessionGateState).mockResolvedValue(
      adminSession as Awaited<ReturnType<typeof resolveSessionGateState>>,
    );

    const { adminRouteLoader } = await import('#client/app/routes/admin-route-loader');
    await expect(adminRouteLoader()).resolves.toEqual({
      kind: 'admin',
      sessionState: adminSession,
    });

    // A signed-in non-admin gets the enroll form (they register a new admin
    // account); in-place promotion is a later, panel-gated capability.
    const userSession = {
      status: 'authenticated',
      session: { user: { id: 'u1', role: 'user' } },
    };
    vi.mocked(resolveSessionGateState).mockResolvedValue(
      userSession as Awaited<ReturnType<typeof resolveSessionGateState>>,
    );
    await expect(adminRouteLoader()).resolves.toEqual({
      kind: 'enroll',
      sessionState: userSession,
    });
  });
});
