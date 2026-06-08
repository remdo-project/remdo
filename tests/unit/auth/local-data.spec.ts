import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalUserData } from '#client/app/auth/local-data';

describe('local user data cleanup', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
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
      'Failed to clear all local user data.',
    );
  });

  it('still attempts IndexedDB cleanup when cookie cleanup fails', async () => {
    const deleteDatabase = vi.fn(() => ({
      addEventListener: (event: string, listener: () => void) => {
        if (event === 'success') {
          listener();
        }
      },
    }));
    vi.stubGlobal('cookieStore', {
      delete: vi.fn().mockRejectedValue(new Error('cookie failed')),
    });
    vi.stubGlobal('indexedDB', {
      databases: async () => [
        { name: 'y-sweet-doc' },
      ],
      deleteDatabase,
    });

    await expect(clearLocalUserData()).rejects.toThrow('Failed to clear all local user data.');

    expect(deleteDatabase).toHaveBeenCalledWith('y-sweet-doc');
  });
});
