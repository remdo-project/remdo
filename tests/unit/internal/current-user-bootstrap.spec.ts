import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasRememberedSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/auth/client', () => ({
  hasRememberedSession: hasRememberedSessionMock,
  isLikelyFetchUnavailableError: (error: unknown) => error instanceof TypeError,
}));

const BOOTSTRAP = {
  userDataDocumentId: 'cachedUserData1',
  homeDocumentId: 'cachedHome1',
} as const;

describe('current user bootstrap cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    hasRememberedSessionMock.mockReset();
    localStorage.clear();
  });

  it('stores a successful bootstrap response for later offline use', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => BOOTSTRAP,
    })));
    const { getCachedCurrentUserBootstrap, getCurrentUserBootstrap } = await import('@/documents/current-user-bootstrap');

    await expect(getCurrentUserBootstrap()).resolves.toEqual(BOOTSTRAP);

    expect(getCachedCurrentUserBootstrap()).toEqual(BOOTSTRAP);
  });

  it('uses the cached bootstrap when offline with remembered auth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => BOOTSTRAP,
    })));
    let bootstrapModule = await import('@/documents/current-user-bootstrap');
    await expect(bootstrapModule.getCurrentUserBootstrap()).resolves.toEqual(BOOTSTRAP);

    vi.resetModules();
    hasRememberedSessionMock.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('offline');
    }));
    bootstrapModule = await import('@/documents/current-user-bootstrap');

    await expect(bootstrapModule.getHomeDocumentId()).resolves.toBe(BOOTSTRAP.homeDocumentId);
  });

  it('uses the cached bootstrap when the app server is unavailable with remembered auth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => BOOTSTRAP,
    })));
    let bootstrapModule = await import('@/documents/current-user-bootstrap');
    await expect(bootstrapModule.getCurrentUserBootstrap()).resolves.toEqual(BOOTSTRAP);

    vi.resetModules();
    hasRememberedSessionMock.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    bootstrapModule = await import('@/documents/current-user-bootstrap');

    await expect(bootstrapModule.getHomeDocumentId()).resolves.toBe(BOOTSTRAP.homeDocumentId);
  });

  it('does not use the cached bootstrap for reachable server errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => BOOTSTRAP,
    })));
    let bootstrapModule = await import('@/documents/current-user-bootstrap');
    await expect(bootstrapModule.getCurrentUserBootstrap()).resolves.toEqual(BOOTSTRAP);

    vi.resetModules();
    hasRememberedSessionMock.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
    })));
    bootstrapModule = await import('@/documents/current-user-bootstrap');

    await expect(bootstrapModule.getCurrentUserBootstrap()).rejects.toThrow('Failed to load current user bootstrap: 500');
  });

  it('does not use the cached bootstrap without remembered auth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => BOOTSTRAP,
    })));
    let bootstrapModule = await import('@/documents/current-user-bootstrap');
    await expect(bootstrapModule.getCurrentUserBootstrap()).resolves.toEqual(BOOTSTRAP);

    vi.resetModules();
    hasRememberedSessionMock.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('offline');
    }));
    bootstrapModule = await import('@/documents/current-user-bootstrap');

    await expect(bootstrapModule.getCurrentUserBootstrap()).rejects.toThrow('offline');
  });

  it('clears the memory and durable bootstrap cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => BOOTSTRAP,
    })));
    const { clearCurrentUserBootstrapCache, getCachedCurrentUserBootstrap, getCurrentUserBootstrap } = await import('@/documents/current-user-bootstrap');
    await expect(getCurrentUserBootstrap()).resolves.toEqual(BOOTSTRAP);

    clearCurrentUserBootstrapCache();

    expect(getCachedCurrentUserBootstrap()).toBeNull();
  });
});
