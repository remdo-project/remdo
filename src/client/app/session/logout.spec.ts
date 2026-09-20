import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hasConfirmedSignOut,
  hasPendingSignOut,
  hasRememberedSession,
  rememberAuthenticatedSession,
} from '#client/app/session/client';
import { signOut } from '#client/app/session/session-http';
import { clearLocalUserData } from '#client/app/session/local-data';
import { logoutCurrentUser } from '#client/app/session/logout';
import { resetUserData } from '#client/app/user-data/user-data';
import { clearCurrentUserBootstrapCache } from '#client/app/user-data/current-user-bootstrap';
import {
  clearUnsyncedLocalChanges,
  hasUnsyncedLocalChanges,
  markDocumentUnsynced,
} from '#collaboration/unsynced-local-changes';

vi.mock('#client/app/session/session-http', () => ({
  signOut: vi.fn(),
}));

vi.mock('#client/app/session/local-data', () => ({
  clearLocalUserData: vi.fn(),
}));

vi.mock('#client/app/user-data/user-data', () => ({
  resetUserData: vi.fn(),
}));

vi.mock('#client/app/user-data/current-user-bootstrap', () => ({
  clearCurrentUserBootstrapCache: vi.fn(),
}));

function expectSignedOutLocally() {
  expect(hasRememberedSession()).toBe(false);
  expect(clearCurrentUserBootstrapCache).toHaveBeenCalledTimes(1);
  expect(resetUserData).toHaveBeenCalledTimes(1);
  expect(clearLocalUserData).toHaveBeenCalledTimes(1);
}

describe('logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signOut).mockResolvedValue();
    vi.mocked(clearLocalUserData).mockResolvedValue();
    rememberAuthenticatedSession();
    clearUnsyncedLocalChanges();
  });

  it('signs out locally after the server confirms', async () => {
    await logoutCurrentUser();

    expect(hasConfirmedSignOut()).toBe(true);
    expectSignedOutLocally();
  });

  it('drops origin-wide unsynced marks so the next session does not inherit them', async () => {
    markDocumentUnsynced('doc-a');

    await logoutCurrentUser();

    expect(hasUnsyncedLocalChanges()).toBe(false);
  });

  it('signs out locally when the server never answers', async () => {
    vi.useFakeTimers();
    vi.mocked(signOut).mockReturnValue(new Promise(() => {}));

    const logout = logoutCurrentUser();
    await vi.advanceTimersByTimeAsync(5000);
    await logout;

    expectSignedOutLocally();
    expect(hasPendingSignOut()).toBe(true);
    expect(hasConfirmedSignOut()).toBe(false);
    vi.useRealTimers();
  });

  it('signs out locally when clearing local databases fails', async () => {
    vi.mocked(clearLocalUserData).mockRejectedValue(new Error('blocked'));

    await logoutCurrentUser();

    expect(hasRememberedSession()).toBe(false);
    expect(clearCurrentUserBootstrapCache).toHaveBeenCalledTimes(1);
  });

  it('never leaves the session remembered when local cleanup hangs', async () => {
    vi.useFakeTimers();
    vi.mocked(clearLocalUserData).mockReturnValue(new Promise(() => {}));

    const logout = logoutCurrentUser();
    await vi.advanceTimersByTimeAsync(5000);
    await logout;

    expect(hasRememberedSession()).toBe(false);
    vi.useRealTimers();
  });
});
