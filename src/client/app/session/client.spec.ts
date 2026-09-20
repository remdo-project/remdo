import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

vi.mock('./session-http', () => ({
  getSession: getSessionMock,
  signOut: signOutMock,
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
    getSessionMock.mockResolvedValue(session);
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
    getSessionMock.mockRejectedValue({ status: 503 });
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
    getSessionMock.mockRejectedValue({ status: 401 });
    localStorage.setItem('remdo-authenticated-session', '1');
    localStorage.setItem('remdo-current-user-bootstrap', JSON.stringify({ userId: 'oldUser' }));
    const { resolveSessionGateState } = await import('#client/app/session/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });

    expect(localStorage.getItem('remdo-authenticated-session')).toBeNull();
    expect(localStorage.getItem('remdo-current-user-bootstrap')).toBeNull();
  });

  it('honors a confirmed absent session when the browser reports offline', async () => {
    getSessionMock.mockResolvedValue(null);
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const { resolveSessionGateState } = await import('#client/app/session/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });
  });

  it.each([true, false])('clears remembered state when the server confirms no session (online=%s)', async (online) => {
    getSessionMock.mockResolvedValue(null);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
    localStorage.setItem('remdo-authenticated-session', '1');
    localStorage.setItem('remdo-current-user-bootstrap', JSON.stringify({ userId: 'oldUser' }));
    const { resolveSessionGateState } = await import('#client/app/session/client');

    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });

    expect(localStorage.getItem('remdo-authenticated-session')).toBeNull();
    expect(localStorage.getItem('remdo-current-user-bootstrap')).toBeNull();
  });

  it('completes sign-in memory when tab storage rejects origin-mark removal', async () => {
    const {
      PENDING_SIGN_OUT_STORAGE_KEY,
      rememberAuthenticatedSession,
      rememberPendingSignOut,
    } = await import('#client/app/session/client');
    rememberPendingSignOut();
    const removeItem = vi.spyOn(sessionStorage, 'removeItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    try {
      expect(() => rememberAuthenticatedSession()).not.toThrow();
      expect(localStorage.getItem('remdo-authenticated-session')).toBe('1');
      expect(localStorage.getItem(PENDING_SIGN_OUT_STORAGE_KEY)).toBeNull();
    } finally {
      removeItem.mockRestore();
    }
  });

  it('writes a pending marker when crypto.randomUUID is unavailable', async () => {
    const { PENDING_SIGN_OUT_STORAGE_KEY, rememberPendingSignOut } = await import('#client/app/session/client');
    vi.stubGlobal('crypto', {});

    try {
      expect(() => rememberPendingSignOut()).not.toThrow();
      expect(localStorage.getItem(PENDING_SIGN_OUT_STORAGE_KEY)).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('still writes the shared pending marker when tab storage rejects the origin mark', async () => {
    const { PENDING_SIGN_OUT_STORAGE_KEY, rememberPendingSignOut } = await import('#client/app/session/client');
    const setItem = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    try {
      expect(() => rememberPendingSignOut()).not.toThrow();
      expect(localStorage.getItem(PENDING_SIGN_OUT_STORAGE_KEY)).toBeTruthy();
    } finally {
      setItem.mockRestore();
    }
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

  it('keeps pending logout locked without server calls on repeated route loads', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'user1' } });
    const { rememberPendingSignOut, resolveSessionGateState } = await import('./client');
    rememberPendingSignOut();
    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });
    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });
    expect(signOutMock).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('shares explicit server confirmation across tabs without restoring the session', async () => {
    signOutMock.mockResolvedValue(undefined);
    const { rememberPendingSignOut, revokeServerSession, hasConfirmedSignOut, resolveSessionGateState } = await import('./client');
    rememberPendingSignOut();
    await revokeServerSession();
    sessionStorage.clear();
    expect(hasConfirmedSignOut()).toBe(true);
    await expect(resolveSessionGateState()).resolves.toEqual({ status: 'unauthenticated' });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('leaves failed logout pending until an explicit successful retry', async () => {
    signOutMock.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(undefined);
    const { rememberPendingSignOut, revokeServerSession, hasConfirmedSignOut, hasPendingSignOut } = await import('./client');
    rememberPendingSignOut();
    await revokeServerSession();
    expect(hasPendingSignOut()).toBe(true);
    expect(hasConfirmedSignOut()).toBe(false);
    await revokeServerSession();
    expect(hasConfirmedSignOut()).toBe(true);
  });

  it('does not revoke a new login from a stale finish-logout action', async () => {
    const { rememberPendingSignOut, rememberAuthenticatedSession, revokeServerSession, resolveSessionGateState } = await import('./client');
    rememberPendingSignOut();
    rememberAuthenticatedSession();
    await revokeServerSession();
    getSessionMock.mockResolvedValue({ user: { id: 'new-user' } });
    await expect(resolveSessionGateState()).resolves.toMatchObject({ status: 'authenticated' });
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('ignores late logout %s after a newer login', async (outcome) => {
    let resolve!: () => void;
    let reject!: (reason: Error) => void;
    signOutMock.mockReturnValue(new Promise<void>((accept, fail) => {
      resolve = accept;
      reject = fail;
    }));
    const { rememberPendingSignOut, rememberAuthenticatedSession, revokeServerSession, hasPendingSignOut } = await import('./client');
    rememberPendingSignOut();
    const logout = revokeServerSession();
    rememberAuthenticatedSession();
    if (outcome === 'resolve') resolve();
    else reject(new TypeError('network unavailable'));
    await logout;
    expect(hasPendingSignOut()).toBe(false);
  });

  it('bounds an explicit logout request that never settles', async () => {
    vi.useFakeTimers();
    signOutMock.mockReturnValue(new Promise(() => {}));
    const { rememberPendingSignOut, revokeServerSession, hasConfirmedSignOut } = await import('./client');
    rememberPendingSignOut();
    const logout = revokeServerSession();
    await vi.advanceTimersByTimeAsync(2000);
    await logout;
    expect(hasConfirmedSignOut()).toBe(false);
    vi.useRealTimers();
  });
});
