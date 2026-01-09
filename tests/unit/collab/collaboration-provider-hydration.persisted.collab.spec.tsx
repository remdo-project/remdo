import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { CollabSession } from '#lib/collaboration/session';
import type { ProviderFactory } from '#lib/collaboration/runtime';
import { createMockProvider } from './_support/mock-provider';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('collaboration session hydration persistence', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('keeps hydrated true after a transient connection error on the same document', async () => {
    const docId = 'doc-id';
    const docMap = new Map<string, Y.Doc>([[docId, new Y.Doc()]]);
    const provider = createMockProvider();
    const factory: ProviderFactory = () => provider as any;
    const session = new CollabSession({ enabled: true, docId, providerFactory: factory });

    session.attach(docMap);

    provider.synced = true;
    provider.emit('sync', true);

    expect(session.snapshot().hydrated).toBe(true);
    const epochBefore = session.snapshot().docEpoch;

    provider.emit('connection-error', new Error('drop'));

    expect(session.snapshot().hydrated).toBe(true);
    expect(session.snapshot().synced).toBe(false);
    expect(session.snapshot().docEpoch).toBe(epochBefore);

    provider.synced = true;
    provider.emit('sync', true);

    await session.awaitSynced();
    expect(session.snapshot().synced).toBe(true);
  });
});
