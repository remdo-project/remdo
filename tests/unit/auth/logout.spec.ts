import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authClient, forgetAuthenticatedSession } from '#client/app/auth/client';
import { logoutCurrentUser } from '#client/app/auth/logout';
import { resetUserData } from '#client/app/documents/user-data';
import { clearCurrentUserBootstrapCache } from '#client/app/documents/current-user-bootstrap';

vi.mock('#client/app/auth/client', () => ({
  authClient: {
    signOut: vi.fn(),
  },
  forgetAuthenticatedSession: vi.fn(),
}));

vi.mock('#client/app/documents/user-data', () => ({
  resetUserData: vi.fn(),
}));

vi.mock('#client/app/documents/current-user-bootstrap', () => ({
  clearCurrentUserBootstrapCache: vi.fn(),
}));

describe('logout client state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears client state and reports server logout after Better Auth signs out', async () => {
    vi.mocked(authClient.signOut).mockResolvedValue({ data: { success: true }, error: null });

    await expect(logoutCurrentUser()).resolves.toEqual({
      serverSignedOut: true,
    });

    expect(authClient.signOut).toHaveBeenCalledTimes(1);
    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearCurrentUserBootstrapCache).toHaveBeenCalledTimes(1);
    expect(resetUserData).toHaveBeenCalledTimes(1);
  });

  it('still clears client state when Better Auth rejects logout', async () => {
    const error = { message: 'sign-out failed' };
    vi.mocked(authClient.signOut).mockResolvedValue({ data: null, error });

    await expect(logoutCurrentUser()).resolves.toEqual({
      serverSignedOut: false,
    });

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearCurrentUserBootstrapCache).toHaveBeenCalledTimes(1);
    expect(resetUserData).toHaveBeenCalledTimes(1);
  });

  it('still clears client state when Better Auth sign-out throws', async () => {
    const error = new TypeError('offline');
    vi.mocked(authClient.signOut).mockRejectedValue(error);

    await expect(logoutCurrentUser()).resolves.toEqual({
      serverSignedOut: false,
    });

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearCurrentUserBootstrapCache).toHaveBeenCalledTimes(1);
    expect(resetUserData).toHaveBeenCalledTimes(1);
  });
});
