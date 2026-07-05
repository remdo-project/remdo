import { describe, expect, it, vi } from 'vitest';
import { resolveAdminEnrollPostCreateDestination } from '#client/app/routes/admin-enroll-post-create-destination';

const CURRENT_ORIGIN = 'https://remdo.test';

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

describe('admin enroll route', () => {
  it('resumes OAuth authorization after enrolling the first admin', () => {
    const search = '?response_type=code&client_id=source&redirect_uri=https%3A%2F%2Fsource.test%2Fcallback';

    expect(resolveAdminEnrollPostCreateDestination(search, CURRENT_ORIGIN)).toEqual({
      kind: 'assign',
      href: `/api/auth/oauth2/authorize${search}`,
    });
  });

  it('honours an explicit next path over the admin default', () => {
    expect(resolveAdminEnrollPostCreateDestination('?next=/sharing', CURRENT_ORIGIN)).toEqual({
      kind: 'navigate',
      path: '/sharing',
    });
  });

  it('lands on the admin panel by default after enrolling', () => {
    expect(resolveAdminEnrollPostCreateDestination('', CURRENT_ORIGIN)).toEqual({
      kind: 'navigate',
      path: '/admin',
    });
  });
});
