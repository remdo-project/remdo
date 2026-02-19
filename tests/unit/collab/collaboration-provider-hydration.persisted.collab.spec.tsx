import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { CollabSession } from '#lib/collaboration/session';
import { createMockProvider, createMockProviderFactory } from './_support/mock-provider';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('collaboration session hydration persistence', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('keeps hydrated true after a transient connection error on the same document', async () => {
    const docId = 'docId';
    const docMap = new Map<string, Y.Doc>([[docId, new Y.Doc()]]);
    const provider = createMockProvider();
    const factory = createMockProviderFactory(provider);
    const session = new CollabSession({ enabled: true, docId, providerFactory: factory });
    const setStatus = (status: typeof provider.status) => {
      provider.status = status;
      provider.synced = status === 'connected';
      provider.emit('connection-status', status);
    };

    expect(session.snapshot().connectionStatus).toBe('connecting');
    session.attach(docMap);
    await Promise.resolve();
    expect(session.snapshot().connectionStatus).toBe('disconnected');

    setStatus('connected');
    provider.emit('sync', true);

    expect(session.snapshot().hydrated).toBe(true);
    expect(session.snapshot().localCacheHydrated).toBe(false);
    const epochBefore = session.snapshot().docEpoch;

    setStatus('error');
    provider.emit('connection-error', new Error('drop'));

    expect(session.snapshot().hydrated).toBe(true);
    expect(session.snapshot().synced).toBe(false);
    expect(session.snapshot().connectionStatus).toBe('error');
    expect(session.snapshot().docEpoch).toBe(epochBefore);

    setStatus('connecting');
    setStatus('connected');
    provider.emit('sync', true);

    await session.awaitSynced();
    expect(session.snapshot().synced).toBe(true);
    expect(session.snapshot().connectionStatus).toBe('connected');
  });

  it('keeps hydrated false when disconnected before first hydration', async () => {
    const docId = 'docId-pre-hydration';
    const docMap = new Map<string, Y.Doc>([[docId, new Y.Doc()]]);
    const provider = createMockProvider();
    const factory = createMockProviderFactory(provider);
    const session = new CollabSession({ enabled: true, docId, providerFactory: factory });

    session.attach(docMap);
    await Promise.resolve();

    expect(session.snapshot().hydrated).toBe(false);
    expect(session.snapshot().connectionStatus).toBe('disconnected');

    provider.status = 'error';
    provider.synced = false;
    provider.emit('connection-status', 'error');
    provider.emit('connection-error', new Error('drop before hydration'));

    expect(session.snapshot().hydrated).toBe(false);
    expect(session.snapshot().synced).toBe(false);
    expect(session.snapshot().connectionStatus).toBe('error');
  });

  it('marks hydrated from local doc updates without requiring server sync', async () => {
    const docId = 'docId-local';
    const doc = new Y.Doc();
    const docMap = new Map<string, Y.Doc>([[docId, doc]]);
    const provider = createMockProvider();
    const factory = createMockProviderFactory(provider);
    const session = new CollabSession({ enabled: true, docId, providerFactory: factory });

    expect(session.snapshot().connectionStatus).toBe('connecting');
    session.attach(docMap);
    expect(session.snapshot().hydrated).toBe(false);
    expect(session.snapshot().synced).toBe(false);
    expect(session.snapshot().localCacheHydrated).toBe(false);

    doc.transact(() => {
      doc.getText('offline').insert(0, 'cached');
    }, { source: 'local-cache' });

    expect(session.snapshot().hydrated).toBe(true);
    expect(session.snapshot().localCacheHydrated).toBe(true);
    expect(session.snapshot().synced).toBe(false);
  });

  it('resets hydrated to false when re-attaching a hydrated session', () => {
    const docId = 'docId-reattach';
    const docMap = new Map<string, Y.Doc>([[docId, new Y.Doc()]]);
    const provider = createMockProvider();
    const factory = createMockProviderFactory(provider);
    const session = new CollabSession({ enabled: true, docId, providerFactory: factory });

    session.attach(docMap);
    provider.status = 'connected';
    provider.synced = true;
    provider.emit('connection-status', 'connected');
    provider.emit('sync', true);
    expect(session.snapshot().hydrated).toBe(true);

    provider.status = 'offline';
    provider.synced = false;
    session.attach(docMap);

    expect(session.snapshot().hydrated).toBe(false);
    expect(session.snapshot().synced).toBe(false);
    expect(session.snapshot().connectionStatus).toBe('disconnected');
  });
});
