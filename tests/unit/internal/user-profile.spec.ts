import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasRememberedSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/auth/client', () => ({
  hasRememberedSession: hasRememberedSessionMock,
  isLikelyFetchUnavailableError: (error: unknown) => error instanceof TypeError,
}));

const PROFILE = {
  configDocumentId: 'cachedCfg1',
  homeDocumentId: 'cachedHome1',
} as const;

describe('user profile bootstrap cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    hasRememberedSessionMock.mockReset();
    localStorage.clear();
  });

  it('stores a successful profile response for later offline use', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => PROFILE,
    })));
    const { getCachedUserProfile, getUserProfile } = await import('@/documents/user-profile');

    await expect(getUserProfile()).resolves.toEqual(PROFILE);

    expect(getCachedUserProfile()).toEqual(PROFILE);
  });

  it('uses the cached profile when offline with remembered auth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => PROFILE,
    })));
    let profileModule = await import('@/documents/user-profile');
    await expect(profileModule.getUserProfile()).resolves.toEqual(PROFILE);

    vi.resetModules();
    hasRememberedSessionMock.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('offline');
    }));
    profileModule = await import('@/documents/user-profile');

    await expect(profileModule.getHomeDocumentId()).resolves.toBe(PROFILE.homeDocumentId);
  });

  it('uses the cached profile when the app server is unavailable with remembered auth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => PROFILE,
    })));
    let profileModule = await import('@/documents/user-profile');
    await expect(profileModule.getUserProfile()).resolves.toEqual(PROFILE);

    vi.resetModules();
    hasRememberedSessionMock.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    profileModule = await import('@/documents/user-profile');

    await expect(profileModule.getHomeDocumentId()).resolves.toBe(PROFILE.homeDocumentId);
  });

  it('does not use the cached profile for reachable server errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => PROFILE,
    })));
    let profileModule = await import('@/documents/user-profile');
    await expect(profileModule.getUserProfile()).resolves.toEqual(PROFILE);

    vi.resetModules();
    hasRememberedSessionMock.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
    })));
    profileModule = await import('@/documents/user-profile');

    await expect(profileModule.getUserProfile()).rejects.toThrow('Failed to load user profile: 500');
  });

  it('does not use the cached profile without remembered auth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => PROFILE,
    })));
    let profileModule = await import('@/documents/user-profile');
    await expect(profileModule.getUserProfile()).resolves.toEqual(PROFILE);

    vi.resetModules();
    hasRememberedSessionMock.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('offline');
    }));
    profileModule = await import('@/documents/user-profile');

    await expect(profileModule.getUserProfile()).rejects.toThrow('offline');
  });

  it('clears the memory and durable profile cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => PROFILE,
    })));
    const { clearUserProfileCache, getCachedUserProfile, getUserProfile } = await import('@/documents/user-profile');
    await expect(getUserProfile()).resolves.toEqual(PROFILE);

    clearUserProfileCache();

    expect(getCachedUserProfile()).toBeNull();
  });
});
