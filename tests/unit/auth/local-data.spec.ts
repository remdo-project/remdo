import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLocalUserData,
  markLocalUserDataCleanupPending,
  retryPendingLocalUserDataCleanup,
} from '@/auth/local-data';

describe('local user data cleanup', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('deletes Y-Sweet IndexedDB databases and offline key cookie', async () => {
    const deleteCookie = vi.fn();
    const deleteDatabase = vi.fn((name: string) => ({
      addEventListener: (event: string, listener: () => void) => {
        if (event === 'success') {
          listener();
        }
      },
      name,
    }));
    vi.stubGlobal('cookieStore', {
      delete: deleteCookie,
    });
    vi.stubGlobal('indexedDB', {
      databases: async () => [
        { name: 'y-sweet-docA' },
        { name: 'app-cache' },
        { name: 'y-sweet-docB' },
      ],
      deleteDatabase,
    });

    await clearLocalUserData();

    expect(deleteDatabase).toHaveBeenCalledWith('y-sweet-docA');
    expect(deleteDatabase).toHaveBeenCalledWith('y-sweet-docB');
    expect(deleteDatabase).not.toHaveBeenCalledWith('app-cache');
    expect(deleteCookie).toHaveBeenCalledWith('YSWEET_OFFLINE_KEY');
  });

  it('rejects when a Y-Sweet IndexedDB delete is blocked', async () => {
    vi.stubGlobal('cookieStore', {
      delete: vi.fn(),
    });
    vi.stubGlobal('indexedDB', {
      databases: async () => [
        { name: 'y-sweet-open-doc' },
      ],
      deleteDatabase: vi.fn(() => ({
        addEventListener: (event: string, listener: () => void) => {
          if (event === 'blocked') {
            listener();
          }
        },
      })),
    });

    await expect(clearLocalUserData()).rejects.toThrow(
      'IndexedDB y-sweet-open-doc delete was blocked by an open connection.',
    );
  });

  it('retries pending local data cleanup and clears the marker after success', async () => {
    const deleteCookie = vi.fn();
    const deleteDatabase = vi.fn((name: string) => ({
      addEventListener: (event: string, listener: () => void) => {
        if (event === 'success') {
          listener();
        }
      },
      name,
    }));
    vi.stubGlobal('cookieStore', {
      delete: deleteCookie,
    });
    vi.stubGlobal('indexedDB', {
      databases: async () => [
        { name: 'y-sweet-retry-doc' },
      ],
      deleteDatabase,
    });

    markLocalUserDataCleanupPending();
    await retryPendingLocalUserDataCleanup();

    expect(deleteDatabase).toHaveBeenCalledWith('y-sweet-retry-doc');
    expect(deleteCookie).toHaveBeenCalledWith('YSWEET_OFFLINE_KEY');
    await retryPendingLocalUserDataCleanup();
    expect(deleteDatabase).toHaveBeenCalledTimes(1);
  });

  it('keeps pending local data cleanup marked when retry is blocked', async () => {
    vi.stubGlobal('cookieStore', {
      delete: vi.fn(),
    });
    vi.stubGlobal('indexedDB', {
      databases: async () => [
        { name: 'y-sweet-still-open-doc' },
      ],
      deleteDatabase: vi.fn(() => ({
        addEventListener: (event: string, listener: () => void) => {
          if (event === 'blocked') {
            listener();
          }
        },
      })),
    });

    markLocalUserDataCleanupPending();
    await expect(retryPendingLocalUserDataCleanup()).rejects.toThrow(
      'IndexedDB y-sweet-still-open-doc delete was blocked by an open connection.',
    );

    await expect(retryPendingLocalUserDataCleanup()).rejects.toThrow(
      'IndexedDB y-sweet-still-open-doc delete was blocked by an open connection.',
    );
  });
});
