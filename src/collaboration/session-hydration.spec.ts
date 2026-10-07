import { LOCAL_CACHE_ORIGIN } from '#collaboration/local-persistence';
import { afterEach, describe, expect, it } from 'vitest';
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

  it('makes cached content ready without server sync', () => {
    const { doc, session } = createSession();
    expect(session.snapshot().hydrated).toBe(false);
    expect(session.snapshot().localCacheHydrated).toBe(false);

    doc.transact(() => {
      doc.getMap('user-data').set('title', 'Cached document');
    }, LOCAL_CACHE_ORIGIN);

    expect(session.snapshot().hydrated).toBe(true);
    expect(session.snapshot().localCacheHydrated).toBe(true);
    expect(doc.getMap('user-data').get('title')).toBe('Cached document');
    expect(session.snapshot().synced).toBe(false);
    expect(session.snapshot().hasLocalChanges).toBe(false);
  });

  it('becomes ready through server synchronization without cached content', () => {
    const { mock, session } = createSession();
    expect(session.snapshot().hydrated).toBe(false);

    mock.synced = true;
    mock.emit('sync', true);
    expect(session.snapshot().hydrated).toBe(true);
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
});
