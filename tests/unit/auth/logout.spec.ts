import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authClient, forgetAuthenticatedSession } from '@/auth/client';
import { clearAuthenticatedClientState, logoutCurrentUser } from '@/auth/logout';
import { resetUserConfig } from '@/documents/user-config';
import { clearUserProfileCache } from '@/documents/user-profile';
import { clearLocalUserData, markLocalUserDataCleanupPending } from '@/auth/local-data';

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

vi.mock('@/auth/local-data', () => ({
  clearLocalUserData: vi.fn(),
  markLocalUserDataCleanupPending: vi.fn(),
}));

describe('logout client state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clearLocalUserData).mockResolvedValue();
  });

  it('clears remembered auth and user-scoped runtime state', async () => {
    await clearAuthenticatedClientState();

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearUserProfileCache).toHaveBeenCalledTimes(1);
    expect(resetUserConfig).toHaveBeenCalledTimes(1);
    expect(clearLocalUserData).toHaveBeenCalledTimes(1);
    expect(markLocalUserDataCleanupPending).not.toHaveBeenCalled();
  });

  it('clears client state after Better Auth signs out', async () => {
    vi.mocked(authClient.signOut).mockResolvedValue({ data: { success: true }, error: null });

    await logoutCurrentUser();

    expect(authClient.signOut).toHaveBeenCalledTimes(1);
    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearUserProfileCache).toHaveBeenCalledTimes(1);
    expect(resetUserConfig).toHaveBeenCalledTimes(1);
    expect(clearLocalUserData).toHaveBeenCalledTimes(1);
    expect(markLocalUserDataCleanupPending).not.toHaveBeenCalled();
  });

  it('clears client state when Better Auth rejects logout', async () => {
    const error = { message: 'sign-out failed' };
    vi.mocked(authClient.signOut).mockResolvedValue({ data: null, error });

    await logoutCurrentUser();

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearUserProfileCache).toHaveBeenCalledTimes(1);
    expect(resetUserConfig).toHaveBeenCalledTimes(1);
    expect(clearLocalUserData).toHaveBeenCalledTimes(1);
    expect(markLocalUserDataCleanupPending).not.toHaveBeenCalled();
  });

  it('clears client state when Better Auth sign-out throws', async () => {
    vi.mocked(authClient.signOut).mockRejectedValue(new TypeError('offline'));

    await logoutCurrentUser();

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearUserProfileCache).toHaveBeenCalledTimes(1);
    expect(resetUserConfig).toHaveBeenCalledTimes(1);
    expect(clearLocalUserData).toHaveBeenCalledTimes(1);
    expect(markLocalUserDataCleanupPending).not.toHaveBeenCalled();
  });

  it('does not abort logout when local data cleanup is blocked', async () => {
    vi.mocked(authClient.signOut).mockResolvedValue({ data: { success: true }, error: null });
    vi.mocked(clearLocalUserData).mockRejectedValue(new Error('blocked'));

    await logoutCurrentUser();

    expect(forgetAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(clearUserProfileCache).toHaveBeenCalledTimes(1);
    expect(resetUserConfig).toHaveBeenCalledTimes(1);
    expect(clearLocalUserData).toHaveBeenCalledTimes(1);
    expect(markLocalUserDataCleanupPending).toHaveBeenCalledTimes(1);
  });
});
