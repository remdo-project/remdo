import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  forgetAuthenticatedSession,
  rememberPendingSignOut,
  revokeServerSession,
} from '#client/app/auth/client';
import { clearLocalUserData } from '#client/app/auth/local-data';
import { logoutCurrentUser } from '#client/app/auth/logout';
import { resetUserData } from '#client/app/documents/user-data';
import { clearCurrentUserBootstrapCache } from '#client/app/documents/current-user-bootstrap';
import {
  clearUnsyncedLocalChanges,
  hasUnsyncedLocalChanges,
  markDocumentUnsynced,
} from '#collaboration/unsynced-local-changes';

vi.mock('#client/app/auth/client', () => ({
  forgetAuthenticatedSession: vi.fn(),
  rememberPendingSignOut: vi.fn(),
  revokeServerSession: vi.fn(),
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
    clearUnsyncedLocalChanges();
  });

  it('signs out locally after the server confirms', async () => {
    vi.mocked(revokeServerSession).mockResolvedValue();

    await logoutCurrentUser();

    expect(rememberPendingSignOut).toHaveBeenCalled();
    expect(revokeServerSession).toHaveBeenCalledTimes(1);
    expectSignedOutLocally();
  });

  it('drops origin-wide unsynced marks so the next session does not inherit them', async () => {
    markDocumentUnsynced('doc-a');
    vi.mocked(revokeServerSession).mockResolvedValue();

    await logoutCurrentUser();

    expect(hasUnsyncedLocalChanges()).toBe(false);
  });

  it('signs out locally when the server never answers', async () => {
    vi.useFakeTimers();
    vi.mocked(revokeServerSession).mockReturnValue(new Promise(() => {}));

    const logout = logoutCurrentUser();
    await vi.advanceTimersByTimeAsync(5000);
    await logout;

    expectSignedOutLocally();
    vi.useRealTimers();
  });

  it('signs out locally when clearing local databases fails', async () => {
    vi.mocked(revokeServerSession).mockResolvedValue();
    vi.mocked(clearLocalUserData).mockRejectedValue(new Error('blocked'));

    await logoutCurrentUser();

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearCurrentUserBootstrapCache).toHaveBeenCalledTimes(1);
  });

  it('never leaves the session remembered when local cleanup hangs', async () => {
    vi.useFakeTimers();
    vi.mocked(revokeServerSession).mockResolvedValue();
    vi.mocked(clearLocalUserData).mockReturnValue(new Promise(() => {}));

    const logout = logoutCurrentUser();
    await vi.advanceTimersByTimeAsync(5000);
    await logout;

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
