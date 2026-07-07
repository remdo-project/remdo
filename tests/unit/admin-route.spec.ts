import { describe, expect, it, vi } from 'vitest';

vi.mock('#client/app/auth/client', () => ({
  resolveSessionGateState: vi.fn(),
}));
vi.mock('#client/app/documents/current-user-bootstrap', () => ({
  getCurrentUserBootstrap: vi.fn(),
}));

describe('adminRouteLoader', () => {
  it('renders the enroll form for an unauthenticated visitor', async () => {
    const { resolveSessionGateState } = await import('#client/app/auth/client');
    vi.mocked(resolveSessionGateState).mockResolvedValue({ status: 'unauthenticated' });
    const { adminRouteLoader } = await import('#client/app/routes/admin-route-loader');
    await expect(adminRouteLoader()).resolves.toEqual({ kind: 'enroll' });
  });

  it('renders the panel for an admin and the enroll form for a non-admin', async () => {
    const { resolveSessionGateState } = await import('#client/app/auth/client');
    const { getCurrentUserBootstrap } = await import('#client/app/documents/current-user-bootstrap');
    // The loader only branches on `status`; the session payload is unused.
    const authenticated = { status: 'authenticated', session: { userId: 'u1' } };
    vi.mocked(resolveSessionGateState).mockResolvedValue(
      authenticated as Awaited<ReturnType<typeof resolveSessionGateState>>,
    );

    vi.mocked(getCurrentUserBootstrap).mockResolvedValue({
      homeDocumentId: 'h', userDataDocumentId: 'ud', role: 'admin', publicServer: false,
    });
    const { adminRouteLoader } = await import('#client/app/routes/admin-route-loader');
    await expect(adminRouteLoader()).resolves.toEqual({ kind: 'admin' });

    // A signed-in non-admin gets the enroll form (they register a new admin
    // account); in-place promotion is a later, panel-gated capability.
    vi.mocked(getCurrentUserBootstrap).mockResolvedValue({
      homeDocumentId: 'h', userDataDocumentId: 'ud', role: 'user', publicServer: false,
    });
    await expect(adminRouteLoader()).resolves.toEqual({ kind: 'enroll' });
  });
});
