import { describe, expect, it, vi } from 'vitest';

import { waitForSync } from '#collaboration/runtime';
import { createMockProvider } from '../collab/_support/mock-provider';

describe('waitForSync', () => {
  it('resolves immediately when already synced with no local changes', async () => {
    const provider = createMockProvider();
    provider.synced = true;
    provider.hasLocalChanges = false;

    await expect(waitForSync(provider)).resolves.toBeUndefined();
  });

  it('waits for sync and cleared local changes', async () => {
    const provider = createMockProvider();
    provider.synced = false;
    provider.hasLocalChanges = true;

    const readyPromise = waitForSync(provider);

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

    const readyPromise = waitForSync(provider);

    provider.hasLocalChanges = false;
    provider.emit('local-changes', false);

    await expect(readyPromise).resolves.toBeUndefined();
  });

  it('rejects on connection errors', async () => {
    const provider = createMockProvider();
    const readyPromise = waitForSync(provider);

    provider.emit('connection-error', { reason: 'boom' });

    await expect(readyPromise).rejects.toThrow(/collaboration server/i);
  });

  it('ignores transient connection closes and resolves on the reconnect sync', async () => {
    const provider = createMockProvider();
    const readyPromise = waitForSync(provider, { timeoutMs: null });

    // Several drops before the connection finally settles.
    provider.emit('connection-close', { reason: 'transient' });
    provider.emit('connection-close', { reason: 'transient' });

    provider.synced = true;
    provider.hasLocalChanges = false;
    provider.emit('sync', true);

    await expect(readyPromise).resolves.toBeUndefined();
  });

  it('rejects when a close does not reconnect within the reconnect deadline', async () => {
    vi.useFakeTimers();
    try {
      const provider = createMockProvider();
      const readyPromise = waitForSync(provider, { timeoutMs: null, reconnectTimeoutMs: 25 });
      const assertion = expect(readyPromise).rejects.toThrow(/gone/u);

      provider.emit('connection-close', { reason: 'gone' });
      await vi.advanceTimersByTimeAsync(25);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps waiting when a close reconnects before the deadline, even if the resync is slow', async () => {
    vi.useFakeTimers();
    try {
      const provider = createMockProvider();
      const readyPromise = waitForSync(provider, { timeoutMs: null, reconnectTimeoutMs: 25 });

      provider.emit('connection-close', { reason: 'transient' });
      // Reconnects in time, which disarms the deadline...
      await vi.advanceTimersByTimeAsync(10);
      provider.emit('connection-status', 'connected');
      // ...then the resync legitimately takes longer than the reconnect window.
      await vi.advanceTimersByTimeAsync(100);
      provider.synced = true;
      provider.hasLocalChanges = false;
      provider.emit('sync', true);

      await expect(readyPromise).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not cap a healthy slow sync that never closes', async () => {
    vi.useFakeTimers();
    try {
      const provider = createMockProvider();
      const readyPromise = waitForSync(provider, { timeoutMs: null, reconnectTimeoutMs: 25 });

      // A live connection that simply takes a long time to deliver the initial sync.
      await vi.advanceTimersByTimeAsync(1000);
      provider.synced = true;
      provider.hasLocalChanges = false;
      provider.emit('sync', true);

      await expect(readyPromise).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects when aborted', async () => {
    const provider = createMockProvider();
    const controller = new AbortController();
    const readyPromise = waitForSync(provider, { signal: controller.signal });

    controller.abort(new Error('test abort'));

    await expect(readyPromise).rejects.toThrow('test abort');
  });
});
