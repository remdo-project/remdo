import { describe, expect, it } from 'vitest';

import { waitForSync } from '#lib/collaboration/runtime';
import { createMockProvider } from '../collab/_support/provider-test-helpers';

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

  it('rejects when aborted', async () => {
    const provider = createMockProvider();
    const controller = new AbortController();
    const readyPromise = waitForSync(provider, { signal: controller.signal });

    controller.abort(new Error('test abort'));

    await expect(readyPromise).rejects.toThrow('test abort');
  });
});
