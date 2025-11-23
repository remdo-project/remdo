import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as runtime from '#lib/collaboration/runtime';
import { createMockProvider } from './_support/provider-test-helpers';
import { renderCollabHarness } from './_support/provider-harness';
import type { MockProvider } from './_support/provider-test-helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('collaboration provider awaitSynced', () => {
  it('waits for sync plus local-change drain', async () => {
    const factory: runtime.ProviderFactory = (_id: string, _docMap: Map<string, unknown>) =>
      createMockProvider() as unknown as runtime.CollaborationProviderInstance;

    vi.spyOn(runtime, 'createProviderFactory').mockReturnValue(factory);

    const { getCollab, waitForReady } = renderCollabHarness();

    await waitForReady();
    let provider!: MockProvider;

    await act(async () => {
      provider = getCollab().providerFactory('doc-id', new Map()) as unknown as MockProvider;
    });

    const pending = getCollab().awaitSynced();

    provider.synced = true;
    provider.hasLocalChanges = true;
    provider.emit('sync', true);
    provider.emit('local-changes', true);

    const settled = vi.fn();
    pending.then(() => settled('resolved')).catch((error) => settled(error));
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    provider.hasLocalChanges = false;
    provider.emit('local-changes', false);

    await expect(pending).resolves.toBeUndefined();
    await waitFor(() => { expect(getCollab().synced).toBe(true); });
  });

  it('recovers after connection errors', async () => {
    const factory: runtime.ProviderFactory = (_id: string, _docMap: Map<string, unknown>) =>
      createMockProvider() as unknown as runtime.CollaborationProviderInstance;

    vi.spyOn(runtime, 'createProviderFactory').mockReturnValue(factory);

    const { getCollab, waitForReady } = renderCollabHarness();

    await waitForReady();

    let provider!: MockProvider;
    await act(async () => {
      provider = getCollab().providerFactory('doc-id', new Map()) as unknown as MockProvider;
    });

    const firstAwait = getCollab().awaitSynced();

    await act(async () => {
      provider.emit('connection-error', {});
    });

    await expect(firstAwait).rejects.toThrow();
    expect(getCollab().synced).toBe(false);

    provider.hasLocalChanges = true;

    const secondAwait = getCollab().awaitSynced();
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
    expect(getCollab().synced).toBe(true);
  });

  it('re-arms awaitSynced when local changes start after a sync', async () => {
    const factory: runtime.ProviderFactory = (_id: string, _docMap: Map<string, unknown>) =>
      createMockProvider() as unknown as runtime.CollaborationProviderInstance;

    vi.spyOn(runtime, 'createProviderFactory').mockReturnValue(factory);

    const { getCollab, waitForReady } = renderCollabHarness();

    await waitForReady();

    let provider!: MockProvider;
    await act(async () => {
      provider = getCollab().providerFactory('doc-id', new Map()) as unknown as MockProvider;
    });

    await act(async () => {
      provider.synced = true;
      provider.hasLocalChanges = false;
      provider.emit('sync', true);
      provider.emit('local-changes', false);
    });

    await expect(getCollab().awaitSynced()).resolves.toBeUndefined();
    await waitFor(() => { expect(getCollab().synced).toBe(true); });

    await act(async () => {
      provider.hasLocalChanges = true;
      provider.emit('local-changes', true);
    });

    await waitFor(() => { expect(getCollab().synced).toBe(false); });

    const secondAwait = getCollab().awaitSynced();
    const settled = vi.fn();
    secondAwait.then(() => settled('resolved')).catch((error) => settled(error));

    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    await act(async () => {
      provider.hasLocalChanges = false;
      provider.emit('local-changes', false);
    });

    await expect(secondAwait).resolves.toBeUndefined();
    await waitFor(() => { expect(getCollab().synced).toBe(true); });
  });
});
