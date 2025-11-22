import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '#config';
import { CollaborationProvider, useCollaborationStatus } from '@/editor/plugins/collaboration';
import type { CollaborationStatusValue } from '@/editor/plugins/collaboration';
import * as runtime from '#lib/collaboration/runtime';

type Handler = (payload: unknown) => void;

function createMockProvider() {
  const listeners = new Map<string, Set<Handler>>();

  return {
    synced: false,
    hasLocalChanges: false,
    destroy: vi.fn(),
    on(event: string, handler: Handler) {
      const set = listeners.get(event) ?? new Set<Handler>();
      set.add(handler);
      listeners.set(event, set);
    },
    off(event: string, handler: Handler) {
      const set = listeners.get(event);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) {
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
}

function CollabConsumer({ onReady }: { onReady: (value: CollaborationStatusValue) => void }) {
  const value = useCollaborationStatus();

  useEffect(() => { onReady(value); }, [onReady, value]);

  return null;
}

interface MockProvider {
  synced: boolean;
  hasLocalChanges: boolean;
  emit: (event: string, payload?: unknown) => void;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.skipIf(!config.env.COLLAB_ENABLED)('collaboration provider awaitReady', () => {
  it('waits for the current provider to flush new local changes', async () => {
    const factory: runtime.ProviderFactory = (_id: string, _docMap: Map<string, unknown>) =>
      createMockProvider() as unknown as runtime.CollaborationProviderInstance;

    vi.spyOn(runtime, 'createProviderFactory').mockReturnValue(factory);

    let status: CollaborationStatusValue | undefined;
    render(
      <CollaborationProvider>
        <CollabConsumer onReady={(value) => { status = value; }} />
      </CollaborationProvider>
    );

    await waitFor(() => { expect(status).toBeDefined(); });

    const collab = status!;
    let provider!: MockProvider;

    await act(async () => {
      provider = collab.providerFactory('doc-id', new Map()) as unknown as MockProvider;
    });

    const firstAwait = collab.awaitReady();

    provider.synced = true;
    provider.emit('sync', true);
    provider.emit('local-changes', false);

    await expect(firstAwait).resolves.toBeUndefined();

    provider.hasLocalChanges = true;
    provider.emit('local-changes', true);

    const secondAwait = collab.awaitReady();

    const settled = vi.fn();
    secondAwait.then(() => settled('resolved')).catch((error) => settled(error));

    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    provider.hasLocalChanges = false;
    provider.emit('local-changes', false);

    await expect(secondAwait).resolves.toBeUndefined();
  });

  it('retries readiness after connection errors and later syncs', async () => {
    const factory: runtime.ProviderFactory = (_id: string, _docMap: Map<string, unknown>) =>
      createMockProvider() as unknown as runtime.CollaborationProviderInstance;

    vi.spyOn(runtime, 'createProviderFactory').mockReturnValue(factory);

    let status: CollaborationStatusValue | undefined;
    const getCollab = () => {
      if (!status) throw new Error('Collaboration status unavailable');
      return status;
    };

    render(
      <CollaborationProvider>
        <CollabConsumer onReady={(value) => { status = value; }} />
      </CollaborationProvider>
    );

    await waitFor(() => { expect(status).toBeDefined(); });

    let provider!: MockProvider;
    await act(async () => {
      provider = getCollab().providerFactory('doc-id', new Map()) as unknown as MockProvider;
    });

    const firstAwait = getCollab().awaitReady();

    await act(async () => {
      provider.emit('connection-error', {});
    });

    await expect(firstAwait).rejects.toThrow();
    expect(getCollab().ready).toBe(false);

    provider.hasLocalChanges = true;

    const secondAwait = getCollab().awaitReady();
    const settled = vi.fn();
    secondAwait.then(() => settled('resolved')).catch((error) => settled(error));

    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    await act(async () => {
      provider.synced = true;
      provider.emit('sync', true);
      provider.hasLocalChanges = false;
      provider.emit('local-changes', false);
    });

    await expect(secondAwait).resolves.toBeUndefined();
    expect(getCollab().ready).toBe(true);
  });
});
