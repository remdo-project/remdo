import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('router', () => {
  it('redirects the login route to the local home document while using offline fallback', async () => {
    const getHomeDocumentId = vi.fn().mockRejectedValue(new Error('profile should not load offline'));
    vi.doMock('@/auth/client', () => ({
      resolveSessionGateState: vi.fn().mockResolvedValue({ status: 'offline-fallback' }),
    }));
    vi.doMock('@/documents/user-profile', () => ({
      getHomeDocumentId,
    }));

    const { router } = await import('@/router');
    try {
      await router.navigate('/login');

      expect(router.state.location.pathname).toBe('/n/main');
      expect(getHomeDocumentId).not.toHaveBeenCalled();
    } finally {
      router.dispose();
    }
  });

  it('redirects the root route to the local home document while using offline fallback', async () => {
    const getHomeDocumentId = vi.fn().mockRejectedValue(new Error('profile should not load offline'));
    vi.doMock('@/auth/client', () => ({
      resolveSessionGateState: vi.fn().mockResolvedValue({ status: 'offline-fallback' }),
    }));
    vi.doMock('@/documents/user-profile', () => ({
      getHomeDocumentId,
    }));

    const { router } = await import('@/router');
    try {
      await router.navigate('/');

      expect(router.state.location.pathname).toBe('/n/main');
      expect(getHomeDocumentId).not.toHaveBeenCalled();
    } finally {
      router.dispose();
    }
  });
});
