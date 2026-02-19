import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadRuntime() {
  vi.resetModules();
  return import('#lib/collaboration/runtime');
}

function createOpenSuccessRequest(): IDBOpenDBRequest {
  type RequestListener = (event: Event) => void;
  const listeners = new Map<string, Set<RequestListener>>();
  const db = {
    close: vi.fn(),
    objectStoreNames: {
      contains: () => true,
    },
  } as unknown as IDBDatabase;
  const request = {
    result: db,
    error: null,
    addEventListener(type: string, listener: RequestListener) {
      const set = listeners.get(type) ?? new Set<RequestListener>();
      set.add(listener);
      listeners.set(type, set);
    },
  } as unknown as IDBOpenDBRequest;

  const emit = (type: string) => {
    const set = listeners.get(type);
    if (!set) {
      return;
    }
    for (const listener of Array.from(set)) {
      listener(new Event(type));
    }
  };

  queueMicrotask(() => {
    emit('success');
  });

  return request;
}

function createDeleteRequest(): IDBOpenDBRequest {
  return {
    addEventListener() {
      // Cleanup listeners are intentionally no-op for this test double.
    },
  } as unknown as IDBOpenDBRequest;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local persistence support decision', () => {
  it('disables local persistence when indexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', null);

    const { getLocalPersistenceSupportDecision } = await loadRuntime();
    await expect(getLocalPersistenceSupportDecision()).resolves.toEqual({
      enabled: false,
      reason: 'indexedDB unavailable',
    });
  });

  it('disables local persistence when indexedDB cannot be opened', async () => {
    vi.stubGlobal(
      'indexedDB',
      {
        open: () => {
          throw new Error('indexedDB blocked');
        },
        deleteDatabase: vi.fn(() => createDeleteRequest()),
      } as unknown as IDBFactory
    );

    const { getLocalPersistenceSupportDecision } = await loadRuntime();
    await expect(getLocalPersistenceSupportDecision()).resolves.toEqual({
      enabled: false,
      reason: 'indexedDB open failed',
    });
  });

  it('enables local persistence when indexedDB is openable', async () => {
    const open = vi.fn(() => createOpenSuccessRequest());
    const deleteDatabase = vi.fn(() => createDeleteRequest()) as unknown as IDBFactory['deleteDatabase'];

    vi.stubGlobal(
      'indexedDB',
      {
        open,
        deleteDatabase,
      } as unknown as IDBFactory
    );

    const { getLocalPersistenceSupportDecision } = await loadRuntime();
    await expect(getLocalPersistenceSupportDecision()).resolves.toEqual({ enabled: true });

    expect(open).toHaveBeenCalledTimes(1);
    expect(deleteDatabase).toHaveBeenCalledTimes(1);
  });
});
