import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as runtime from '#lib/collaboration/runtime';
import { createMockProvider } from './_support/provider-test-helpers';
import { renderCollabHarness } from './_support/provider-harness';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('collaboration provider hydration persistence', () => {
  it('keeps hydrated true after a transient connection error on the same document', async () => {
    const provider = createMockProvider();

    const factory: runtime.ProviderFactory = (_id: string, _docMap: Map<string, unknown>) =>
      provider as unknown as runtime.CollaborationProviderInstance;
    vi.spyOn(runtime, 'createProviderFactory').mockReturnValue(factory);

    const { getCollab, waitForReady } = renderCollabHarness();

    await waitForReady();

    await act(async () => {
      getCollab().providerFactory('doc-id', new Map());
    });

    provider.synced = true;
    await act(async () => {
      provider.emit('sync', true);
    });

    await waitFor(() => {
      expect(getCollab().hydrated).toBe(true);
    });
    const epochBefore = getCollab().docEpoch;

    await act(async () => {
      provider.emit('connection-error', new Error('drop'));
    });

    expect(getCollab().hydrated).toBe(true); // should not tear down root-schema lifecycle
    expect(getCollab().synced).toBe(false);
    expect(getCollab().docEpoch).toBe(epochBefore);

    provider.synced = true;
    await act(async () => {
      provider.emit('sync', true);
    });

    await getCollab().awaitSynced();
    expect(getCollab().synced).toBe(true);
  });
});
