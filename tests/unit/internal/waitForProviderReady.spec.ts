import { describe, expect, it } from 'vitest';

import { waitForProviderReady } from '#lib/collaboration/runtime';

type Handler = (payload: unknown) => void;

function createMockProvider() {
  const listeners = new Map<string, Set<Handler>>();
  const provider = {
    synced: false,
    hasLocalChanges: false,
    on(event: string, handler: Handler) {
      const set = listeners.get(event) ?? new Set<Handler>();
      set.add(handler);
      listeners.set(event, set);
    },
    off(event: string, handler: Handler) {
      const set = listeners.get(event);
      set?.delete(handler);
      if (set && set.size === 0) {
        listeners.delete(event);
      }
    },
    emit(event: string, payload?: unknown) {
      const set = listeners.get(event);
      if (!set) return;
      for (const handler of Array.from(set)) {
        handler(payload);
      }
    },
  };
  return provider;
}

describe('waitForProviderReady', () => {
  it('resolves immediately when already synced with no local changes', async () => {
    const provider = createMockProvider();
    provider.synced = true;
    provider.hasLocalChanges = false;

    await expect(waitForProviderReady(provider)).resolves.toBeUndefined();
  });

  it('waits for sync and cleared local changes', async () => {
    const provider = createMockProvider();
    provider.synced = false;
    provider.hasLocalChanges = true;

    const readyPromise = waitForProviderReady(provider);

    provider.synced = true;
    provider.hasLocalChanges = false;
    provider.emit('sync', true);
    provider.emit('local-changes', false);

    await expect(readyPromise).resolves.toBeUndefined();
  });

  it('resolves after local changes are cleared when already synced', async () => {
    const provider = createMockProvider();
    provider.synced = true;
    provider.hasLocalChanges = true;

    const readyPromise = waitForProviderReady(provider);

    provider.hasLocalChanges = false;
    provider.emit('local-changes', false);

    await expect(readyPromise).resolves.toBeUndefined();
  });

  it('rejects on connection errors', async () => {
    const provider = createMockProvider();
    const readyPromise = waitForProviderReady(provider);

    provider.emit('connection-error', { reason: 'boom' });

    await expect(readyPromise).rejects.toThrow(/collaboration server/i);
  });

  it('rejects when aborted', async () => {
    const provider = createMockProvider();
    const controller = new AbortController();
    const readyPromise = waitForProviderReady(provider, { signal: controller.signal });

    controller.abort(new Error('test abort'));

    await expect(readyPromise).rejects.toThrow('test abort');
  });
});
