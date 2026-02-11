import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { CollabSession } from '#lib/collaboration/session';
import type { ProviderFactory } from '#lib/collaboration/runtime';
import { createMockProvider } from './_support/mock-provider';
import type { MockProvider } from './_support/mock-provider';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('collaboration session awaitSynced', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  const createSession = () => {
    const docId = 'docId';
    const docMap = new Map<string, Y.Doc>([[docId, new Y.Doc()]]);
    const mock = createMockProvider() as unknown as MockProvider;
    const factory: ProviderFactory = () => mock as any;
    const session = new CollabSession({ enabled: true, docId, providerFactory: factory });
    session.attach(docMap);
    return { session, mock };
  };

  it('waits for sync plus local-change drain', async () => {
    const { session, mock } = createSession();

    const pending = session.awaitSynced();

    mock.synced = true;
    mock.hasLocalChanges = true;
    mock.emit('sync', true);
    mock.emit('local-changes', true);

    mock.hasLocalChanges = false;
    mock.emit('local-changes', false);

    await expect(pending).resolves.toBeUndefined();
    expect(session.snapshot().synced).toBe(true);
  });

  it('recovers after connection errors', async () => {
    const { session, mock } = createSession();

    const firstAwait = session.awaitSynced();
    mock.emit('connection-error', {});
    await expect(firstAwait).rejects.toThrow();
    expect(session.snapshot().synced).toBe(false);

    mock.hasLocalChanges = true;
    const secondAwait = session.awaitSynced();
    mock.synced = true;
    mock.emit('sync', true);
    mock.hasLocalChanges = false;
    mock.emit('local-changes', false);

    await expect(secondAwait).resolves.toBeUndefined();
    expect(session.snapshot().synced).toBe(true);
  });

  it('re-arms when local changes start after a sync', async () => {
    const { session, mock } = createSession();

    mock.synced = true;
    mock.hasLocalChanges = false;
    mock.emit('sync', true);
    mock.emit('local-changes', false);

    await expect(session.awaitSynced()).resolves.toBeUndefined();
    expect(session.snapshot().synced).toBe(true);

    mock.hasLocalChanges = true;
    mock.emit('local-changes', true);
    expect(session.snapshot().synced).toBe(false);

    const second = session.awaitSynced();
    mock.hasLocalChanges = false;
    mock.emit('local-changes', false);

    await expect(second).resolves.toBeUndefined();
    expect(session.snapshot().synced).toBe(true);
  });
});
