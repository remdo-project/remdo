import { LOCAL_CACHE_ORIGIN } from '#collaboration/local-persistence';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CollabSession } from '#collaboration/session';
import { createMockProvider, createMockProviderFactory } from '#tests-collab/mock-provider';

describe('collaboration session hydration', () => {
  const sessions: CollabSession[] = [];

  afterEach(() => {
    for (const session of sessions.splice(0)) {
      session.destroy();
    }
  });

  function createSession() {
    const doc = new Y.Doc();
    const mock = createMockProvider();
    const session = new CollabSession({
      docId: 'cachedDoc',
      enabled: true,
      providerFactory: createMockProviderFactory(mock),
    });
    sessions.push(session);
    session.attach(new Map([['cachedDoc', doc]]));
    return { doc, mock, session };
  }

  it.each(['before', 'after'] as const)('reads cached content loaded %s waiting, without server sync', async (timing) => {
    const { doc, session } = createSession();
    const hydrate = () => doc.transact(() => {
      doc.getMap('user-data').set('title', 'Cached document');
    }, LOCAL_CACHE_ORIGIN);
    if (timing === 'before') {
      hydrate();
    }
    const ready = session.awaitHydrated();
    if (timing === 'after') {
      hydrate();
    }

    await ready;
    expect(doc.getMap('user-data').get('title')).toBe('Cached document');
    expect(session.snapshot().synced).toBe(false);
    expect(session.snapshot().hasLocalChanges).toBe(false);
  });

  it('waits for the server when there is no cached content', async () => {
    const { mock, session } = createSession();
    const hydrated = vi.fn();
    const ready = session.awaitHydrated().then(hydrated);
    await Promise.resolve();
    expect(hydrated).not.toHaveBeenCalled();

    mock.synced = true;
    mock.emit('sync', true);
    await ready;
    expect(hydrated).toHaveBeenCalledOnce();
  });

  it('reports cache failure without losing server synchronization', () => {
    const { mock, session } = createSession();
    mock.status = 'connected';
    mock.synced = true;
    Object.assign(mock, { localPersistenceStatus: 'enabled' });
    mock.emit('connection-status', 'connected');
    mock.emit('sync', true);
    expect(session.snapshot().localPersistenceStatus).toBe('enabled');

    Object.assign(mock, { localPersistenceStatus: 'error' });
    mock.emit('local-persistence-status', 'error');
    expect(session.snapshot()).toMatchObject({
      localPersistenceStatus: 'error', connectionStatus: 'connected', hydrated: true, synced: true,
    });
  });

  it('cancels a pending read when its session is destroyed', async () => {
    const { session } = createSession();
    const rejected = expect(session.awaitHydrated()).rejects.toThrow('Collaboration session destroyed');
    session.destroy();
    await rejected;
  });
});
