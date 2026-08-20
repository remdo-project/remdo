import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

vi.mock('better-auth/react', () => ({
  createAuthClient: () => ({
    getSession: getSessionMock,
    signOut: signOutMock,
  }),
}));

describe('auth client session gate', () => {
  beforeEach(() => {
    vi.useRealTimers();
    getSessionMock.mockReset();
    signOutMock.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('remembers authenticated sessions', async () => {
    const session = { user: { id: 'user1' } };
    getSessionMock.mockResolvedValue({ data: session });
    const { resolveSessionGateState } = await import('#client/app/session/client');

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
    const { rememberAuthenticatedSession, resolveSessionGateState } = await import('#client/app/session/client');

    rememberAuthenticatedSession();

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'offline-remembered' });
  });

  it('uses remembered auth when the app server is unavailable while the browser is online', async () => {
    getSessionMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { rememberAuthenticatedSession, resolveSessionGateState } = await import('#client/app/session/client');

    rememberAuthenticatedSession();

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'offline-remembered' });
  });

  it('uses remembered auth when the auth API returns a server error', async () => {
    getSessionMock.mockResolvedValue({ data: null, error: { status: 503 } });
    const { rememberAuthenticatedSession, resolveSessionGateState } = await import('#client/app/session/client');

    rememberAuthenticatedSession();

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'offline-remembered' });
    expect(localStorage.getItem('remdo-authenticated-session')).toBe('1');
  });

  it('reports offline unavailable when no remembered auth exists', async () => {
    getSessionMock.mockRejectedValue(new TypeError('network unavailable'));
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const { resolveSessionGateState } = await import('#client/app/session/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'offline-unavailable' });
  });

  it('reports offline unavailable when the app server is unavailable without remembered auth', async () => {
    getSessionMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { resolveSessionGateState } = await import('#client/app/session/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'offline-unavailable' });
  });

  it('clears the remembered session when the auth API rejects it', async () => {
    getSessionMock.mockResolvedValue({ data: null, error: { status: 401 } });
    localStorage.setItem('remdo-authenticated-session', '1');
    localStorage.setItem('remdo-current-user-bootstrap', JSON.stringify({
      userDataDocumentId: 'oldUserData',
      homeDocumentId: 'oldHome',
    }));
    const { resolveSessionGateState } = await import('#client/app/session/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });

    expect(localStorage.getItem('remdo-authenticated-session')).toBeNull();
    expect(localStorage.getItem('remdo-current-user-bootstrap')).toBeNull();
  });

  it('keeps signed-out offline in the offline state when the auth client resolves locally', async () => {
    getSessionMock.mockResolvedValue({ data: null });
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const { resolveSessionGateState } = await import('#client/app/session/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'offline-unavailable' });
  });

  it('clears the durable bootstrap cache when the online session is gone', async () => {
    getSessionMock.mockResolvedValue({ data: null });
    localStorage.setItem('remdo-authenticated-session', '1');
    localStorage.setItem('remdo-current-user-bootstrap', JSON.stringify({
      userDataDocumentId: 'oldUserData',
      homeDocumentId: 'oldHome',
    }));
    const { resolveSessionGateState } = await import('#client/app/session/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });

    expect(localStorage.getItem('remdo-authenticated-session')).toBeNull();
    expect(localStorage.getItem('remdo-current-user-bootstrap')).toBeNull();
  });

  it('exposes the pending-sign-out write as a storage event peers can observe', async () => {
    const {
      isPendingSignOutStorageEvent,
      PENDING_SIGN_OUT_STORAGE_KEY,
      rememberPendingSignOut,
    } = await import('#client/app/session/client');

    rememberPendingSignOut();

    expect(isPendingSignOutStorageEvent(new StorageEvent('storage', {
      key: PENDING_SIGN_OUT_STORAGE_KEY,
      newValue: localStorage.getItem(PENDING_SIGN_OUT_STORAGE_KEY),
    }))).toBe(true);
  });

  it('does not resume a session after the server confirms sign-out', async () => {
    signOutMock.mockResolvedValue({ data: { success: true }, error: null });
    getSessionMock.mockResolvedValue({ data: { user: { id: 'user1' } } });
    localStorage.setItem('remdo-pending-sign-out', '1');
    const { resolveSessionGateState } = await import('#client/app/session/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });
    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });

    expect(signOutMock).toHaveBeenCalledTimes(2);
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('remdo-pending-sign-out')).toBe('1');
  });

  it('does not resume a session whose sign-out the server has not confirmed', async () => {
    const session = { user: { id: 'user1' } };
    signOutMock.mockResolvedValue({ data: null, error: { message: 'nope' } });
    getSessionMock.mockResolvedValue({ data: session });
    localStorage.setItem('remdo-pending-sign-out', '1');
    const { resolveSessionGateState } = await import('#client/app/session/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });
    expect(localStorage.getItem('remdo-pending-sign-out')).toBe('1');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });

    expect(signOutMock).toHaveBeenCalledTimes(2);
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('keeps the device signed out when the pending revocation cannot reach the server', async () => {
    signOutMock.mockRejectedValue(new TypeError('offline'));
    localStorage.setItem('remdo-pending-sign-out', '1');
    const { resolveSessionGateState } = await import('#client/app/session/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });

    expect(localStorage.getItem('remdo-pending-sign-out')).toBe('1');
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('does not stall the session gate when pending revocation never settles', async () => {
    vi.useFakeTimers();
    signOutMock.mockReturnValue(new Promise(() => {}));
    localStorage.setItem('remdo-pending-sign-out', '1');
    const { resolveSessionGateState } = await import('#client/app/session/client');

    const pending = resolveSessionGateState();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toEqual({ status: 'unauthenticated' });
    expect(localStorage.getItem('remdo-pending-sign-out')).toBe('1');
    vi.useRealTimers();
  });
});

