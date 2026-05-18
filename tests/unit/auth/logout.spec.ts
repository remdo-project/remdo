import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authClient, forgetAuthenticatedSession } from '@/auth/client';
import { clearAuthenticatedClientState, logoutCurrentUser } from '@/auth/logout';
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

  it('clears remembered auth and user-scoped runtime state', () => {
    clearAuthenticatedClientState();

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearUserProfileCache).toHaveBeenCalledTimes(1);
    expect(resetUserConfig).toHaveBeenCalledTimes(1);
  });

  it('clears client state after Better Auth signs out', async () => {
    vi.mocked(authClient.signOut).mockResolvedValue({ data: { success: true }, error: null });

    await logoutCurrentUser();

    expect(authClient.signOut).toHaveBeenCalledTimes(1);
    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearUserProfileCache).toHaveBeenCalledTimes(1);
    expect(resetUserConfig).toHaveBeenCalledTimes(1);
  });

  it('keeps client state when Better Auth rejects logout', async () => {
    const error = { message: 'sign-out failed' };
    vi.mocked(authClient.signOut).mockResolvedValue({ data: null, error });

    await expect(logoutCurrentUser()).rejects.toBe(error);

    expect(forgetAuthenticatedSession).not.toHaveBeenCalled();
    expect(clearUserProfileCache).not.toHaveBeenCalled();
    expect(resetUserConfig).not.toHaveBeenCalled();
  });
});
