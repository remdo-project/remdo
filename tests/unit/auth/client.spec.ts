import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock('better-auth/react', () => ({
  createAuthClient: () => ({
    getSession: getSessionMock,
  }),
}));

describe('auth client session gate', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    localStorage.clear();
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('remembers authenticated sessions', async () => {
    const session = { user: { id: 'user1' } };
    getSessionMock.mockResolvedValue({ data: session });
    const { resolveSessionGateState } = await import('@/auth/client');

    await expect(resolveSessionGateState()).resolves.toEqual({
      session,
      status: 'authenticated',
    });
    expect(localStorage.getItem('remdo-authenticated-session')).toBe('1');
  });

  it('uses remembered auth for offline session state', async () => {
    getSessionMock.mockRejectedValue(new TypeError('network unavailable'));
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const { rememberAuthenticatedSession, resolveSessionGateState } = await import('@/auth/client');

    rememberAuthenticatedSession();

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'offline-remembered' });
  });

  it('uses remembered auth when the app server is unavailable while the browser is online', async () => {
    getSessionMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { rememberAuthenticatedSession, resolveSessionGateState } = await import('@/auth/client');

    rememberAuthenticatedSession();

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'offline-remembered' });
  });

  it('reports offline unavailable when no remembered auth exists', async () => {
    getSessionMock.mockRejectedValue(new TypeError('network unavailable'));
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const { resolveSessionGateState } = await import('@/auth/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'offline-unavailable' });
  });

  it('reports offline unavailable when the app server is unavailable without remembered auth', async () => {
    getSessionMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { resolveSessionGateState } = await import('@/auth/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'offline-unavailable' });
  });

  it('keeps signed-out offline in the offline state when the auth client resolves locally', async () => {
    getSessionMock.mockResolvedValue({ data: null });
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const { resolveSessionGateState } = await import('@/auth/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'offline-unavailable' });
  });

  it('clears the durable profile cache when the online session is gone', async () => {
    getSessionMock.mockResolvedValue({ data: null });
    localStorage.setItem('remdo-authenticated-session', '1');
    localStorage.setItem('remdo-user-profile', JSON.stringify({
      configDocumentId: 'oldConfig',
      homeDocumentId: 'oldHome',
    }));
    const { resolveSessionGateState } = await import('@/auth/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });

    expect(localStorage.getItem('remdo-authenticated-session')).toBeNull();
    expect(localStorage.getItem('remdo-user-profile')).toBeNull();
  });
});
