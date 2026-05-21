import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authClient, forgetAuthenticatedSession } from '@/auth/client';
import { logoutCurrentUser } from '@/auth/logout';
import { resetUserConfig } from '@/documents/user-config';
import { clearUserProfileCache } from '@/documents/user-profile';

vi.mock('@/auth/client', () => ({
  authClient: {
    signOut: vi.fn(),
  },
  forgetAuthenticatedSession: vi.fn(),
}));

vi.mock('@/documents/user-config', () => ({
  resetUserConfig: vi.fn(),
}));

vi.mock('@/documents/user-profile', () => ({
  clearUserProfileCache: vi.fn(),
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
    expect(clearUserProfileCache).toHaveBeenCalledTimes(1);
    expect(resetUserConfig).toHaveBeenCalledTimes(1);
  });

  it('still clears client state when Better Auth rejects logout', async () => {
    const error = { message: 'sign-out failed' };
    vi.mocked(authClient.signOut).mockResolvedValue({ data: null, error });

    await expect(logoutCurrentUser()).resolves.toEqual({
      serverSignedOut: false,
    });

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearUserProfileCache).toHaveBeenCalledTimes(1);
    expect(resetUserConfig).toHaveBeenCalledTimes(1);
  });

  it('still clears client state when Better Auth sign-out throws', async () => {
    const error = new TypeError('offline');
    vi.mocked(authClient.signOut).mockRejectedValue(error);

    await expect(logoutCurrentUser()).resolves.toEqual({
      serverSignedOut: false,
    });

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearUserProfileCache).toHaveBeenCalledTimes(1);
    expect(resetUserConfig).toHaveBeenCalledTimes(1);
  });
});
