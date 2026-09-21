import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLocalUserData } from '#client/app/session/local-data';
import { LOCAL_PERSISTENCE_KEY_PREFIX } from '#collaboration/local-persistence';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('local user data cleanup', () => {
  it('removes keys synchronously and deletes only encrypted document databases', async () => {
    localStorage.setItem(`${LOCAL_PERSISTENCE_KEY_PREFIX}account`, 'secret');
    const deleteDatabase = vi.fn(() => ({
      addEventListener: (event: string, listener: () => void) => { if (event === 'success') listener(); },
    }));
    vi.stubGlobal('indexedDB', {
      databases: async () => [{ name: 'remdo-encrypted-v1-document' }, { name: 'app-cache' }],
      deleteDatabase,
    });
    const clearing = clearLocalUserData();
    expect(localStorage.getItem(`${LOCAL_PERSISTENCE_KEY_PREFIX}account`)).toBeNull();
    await clearing;
    expect(deleteDatabase.mock.calls).toEqual([['remdo-encrypted-v1-document']]);
  });

  it('leaves ciphertext unreadable and reports blocked deletion', async () => {
    localStorage.setItem(`${LOCAL_PERSISTENCE_KEY_PREFIX}account`, 'secret');
    vi.stubGlobal('indexedDB', {
      databases: async () => [{ name: 'remdo-encrypted-v1-open-document' }],
      deleteDatabase: () => ({
        addEventListener: (event: string, listener: () => void) => { if (event === 'blocked') listener(); },
      }),
    });
    await expect(clearLocalUserData()).rejects.toThrow('Failed to clear all local user data.');
    expect(localStorage.getItem(`${LOCAL_PERSISTENCE_KEY_PREFIX}account`)).toBeNull();
  });

  it('reports key-storage failure while still attempting database cleanup', async () => {
    const deleteDatabase = vi.fn(() => ({
      addEventListener: (event: string, listener: () => void) => { if (event === 'success') listener(); },
    }));
    vi.stubGlobal('localStorage', { get length() { throw new Error('storage denied'); } });
    vi.stubGlobal('indexedDB', {
      databases: async () => [{ name: 'remdo-encrypted-v1-document' }], deleteDatabase,
    });
    await expect(clearLocalUserData()).rejects.toThrow('Failed to clear all local user data.');
    expect(deleteDatabase).toHaveBeenCalledWith('remdo-encrypted-v1-document');
  });
});
