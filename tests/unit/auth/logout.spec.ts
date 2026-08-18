import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authClient,
  forgetAuthenticatedSession,
  forgetPendingSignOut,
  rememberPendingSignOut,
} from '#client/app/auth/client';
import { clearLocalUserData } from '#client/app/auth/local-data';
import { logoutCurrentUser } from '#client/app/auth/logout';
import { resetUserData } from '#client/app/documents/user-data';
import { clearCurrentUserBootstrapCache } from '#client/app/documents/current-user-bootstrap';

vi.mock('#client/app/auth/client', () => ({
  authClient: {
    signOut: vi.fn(),
  },
  forgetAuthenticatedSession: vi.fn(),
  forgetPendingSignOut: vi.fn(),
  rememberPendingSignOut: vi.fn(),
}));

vi.mock('#client/app/auth/local-data', () => ({
  clearLocalUserData: vi.fn(),
}));

vi.mock('#client/app/documents/user-data', () => ({
  resetUserData: vi.fn(),
}));

vi.mock('#client/app/documents/current-user-bootstrap', () => ({
  clearCurrentUserBootstrapCache: vi.fn(),
}));

function expectSignedOutLocally() {
  expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
  expect(clearCurrentUserBootstrapCache).toHaveBeenCalledTimes(1);
  expect(resetUserData).toHaveBeenCalledTimes(1);
  expect(clearLocalUserData).toHaveBeenCalledTimes(1);
}

describe('logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clearLocalUserData).mockResolvedValue();
  });

  it('signs out locally after the server confirms', async () => {
    vi.mocked(authClient.signOut).mockResolvedValue({ data: { success: true }, error: null });

    await logoutCurrentUser();

    expect(authClient.signOut).toHaveBeenCalledTimes(1);
    expectSignedOutLocally();
    expect(forgetPendingSignOut).toHaveBeenCalled();
  });

  it('keeps the device signed out until an undelivered sign-out reaches the server', async () => {
    vi.mocked(authClient.signOut).mockRejectedValue(new TypeError('offline'));

    await logoutCurrentUser();

    // The session cookie is still valid, so the next reachable revalidation
    // would sign this device back in without the marker.
    expect(rememberPendingSignOut).toHaveBeenCalled();
    expect(forgetPendingSignOut).not.toHaveBeenCalled();
  });

  it('signs out locally when the server rejects', async () => {
    vi.mocked(authClient.signOut).mockResolvedValue({ data: null, error: { message: 'nope' } });

    await logoutCurrentUser();

    expectSignedOutLocally();
  });

  it('signs out locally when the server is unreachable', async () => {
    vi.mocked(authClient.signOut).mockRejectedValue(new TypeError('offline'));

    await logoutCurrentUser();

    expectSignedOutLocally();
  });

  it('signs out locally when the server never answers', async () => {
    vi.useFakeTimers();
    vi.mocked(authClient.signOut).mockReturnValue(new Promise(() => {}));

    const logout = logoutCurrentUser();
    await vi.advanceTimersByTimeAsync(5000);
    await logout;

    expectSignedOutLocally();
    vi.useRealTimers();
  });

  it('signs out locally when clearing local databases fails', async () => {
    vi.mocked(authClient.signOut).mockResolvedValue({ data: { success: true }, error: null });
    vi.mocked(clearLocalUserData).mockRejectedValue(new Error('blocked'));

    await logoutCurrentUser();

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearCurrentUserBootstrapCache).toHaveBeenCalledTimes(1);
  });

  it('never leaves the session remembered when local cleanup hangs', async () => {
    vi.useFakeTimers();
    vi.mocked(authClient.signOut).mockResolvedValue({ data: { success: true }, error: null });
    vi.mocked(clearLocalUserData).mockReturnValue(new Promise(() => {}));

    const logout = logoutCurrentUser();
    await vi.advanceTimersByTimeAsync(5000);
    await logout;

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
