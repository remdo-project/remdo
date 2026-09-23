import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { CollabSession } from '#collaboration/session';
import {
  clearUnsyncedLocalChanges,
  hasUnsyncedLocalChanges,
  markDocumentUnsynced,
} from '#collaboration/unsynced-local-changes';
import { createMockProvider, createMockProviderFactory } from '#tests-collab/mock-provider';

function createSession(docId: string) {
  const docMap = new Map<string, Y.Doc>([[docId, new Y.Doc()]]);
  const mock = createMockProvider();
  mock.synced = true;
  const session = new CollabSession({
    docId,
    enabled: true,
    providerFactory: createMockProviderFactory(mock),
  });
  session.attach(docMap);
  return { mock, session };
}

describe('collaboration session unsynced document ledger', () => {
  const sessions: CollabSession[] = [];

  beforeEach(() => {
    clearUnsyncedLocalChanges();
  });

  afterEach(() => {
    for (const session of sessions.splice(0)) {
      session.destroy();
    }
    clearUnsyncedLocalChanges();
  });

  it('does not treat a provider that starts unacked as unsaved work', () => {
    const docId = 'doc-a';
    const docMap = new Map<string, Y.Doc>([[docId, new Y.Doc()]]);
    const mock = createMockProvider();
    mock.hasLocalChanges = true;
    const session = new CollabSession({
      docId,
      enabled: true,
      providerFactory: createMockProviderFactory(mock),
    });
    session.attach(docMap);
    sessions.push(session);

    expect(session.snapshot().hasLocalChanges).toBe(false);
    expect(hasUnsyncedLocalChanges()).toBe(false);
  });

  it('does not treat cached updates before the first sync as newly unsaved work', () => {
    const docId = 'cached-doc';
    const mock = createMockProvider();
    const session = new CollabSession({
      docId,
      enabled: true,
      providerFactory: createMockProviderFactory(mock),
    });
    session.attach(new Map([[docId, new Y.Doc()]]));
    sessions.push(session);

    mock.hasLocalChanges = true;
    mock.emit('local-changes', true);

    expect(session.snapshot().hasLocalChanges).toBe(false);
    expect(hasUnsyncedLocalChanges()).toBe(false);
  });

  it('reports cached edits this tab left unacknowledged until the provider acknowledges them', () => {
    const docId = 'cached-doc';
    markDocumentUnsynced(docId);
    const docMap = new Map([[docId, new Y.Doc()]]);
    const mock = createMockProvider();
    const session = new CollabSession({
      docId,
      enabled: true,
      providerFactory: createMockProviderFactory(mock),
    });
    session.attach(docMap);
    sessions.push(session);

    mock.hasLocalChanges = true;
    mock.emit('local-changes', true);
    expect(session.snapshot().hasLocalChanges).toBe(true);

    // The server's sync step arrives before it acknowledges the client's state.
    mock.synced = true;
    mock.emit('sync', true);
    expect(session.snapshot().hasLocalChanges).toBe(true);

    session.attach(docMap);
    mock.emit('local-changes', true);
    expect(session.snapshot().hasLocalChanges).toBe(true);

    mock.hasLocalChanges = false;
    mock.emit('local-changes', false);
    expect(session.snapshot().hasLocalChanges).toBe(false);
    expect(hasUnsyncedLocalChanges()).toBe(false);
  });

  it('reports cached edits another tab left unacknowledged without clearing its mark', () => {
    const otherTabMark = 'remdo-unsynced:shared-doc:other-tab';
    localStorage.setItem(otherTabMark, '1');
    const mock = createMockProvider();
    const session = new CollabSession({
      docId: 'shared-doc',
      enabled: true,
      providerFactory: createMockProviderFactory(mock),
    });
    session.attach(new Map([['shared-doc', new Y.Doc()]]));
    sessions.push(session);

    mock.hasLocalChanges = true;
    mock.emit('local-changes', true);
    expect(session.snapshot().hasLocalChanges).toBe(true);

    mock.synced = true;
    mock.hasLocalChanges = false;
    mock.emit('local-changes', false);
    expect(session.snapshot().hasLocalChanges).toBe(false);
    // That tab may still hold edits made after this one hydrated the cache.
    expect(localStorage.getItem(otherTabMark)).toBe('1');
  });

  it('does not count a mark for a document whose id extends this one', () => {
    localStorage.setItem('remdo-unsynced:doc-ab:other-tab', '1');
    const mock = createMockProvider();
    const session = new CollabSession({
      docId: 'doc-a',
      enabled: true,
      providerFactory: createMockProviderFactory(mock),
    });
    session.attach(new Map([['doc-a', new Y.Doc()]]));
    sessions.push(session);

    mock.hasLocalChanges = true;
    mock.emit('local-changes', true);
    expect(session.snapshot().hasLocalChanges).toBe(false);
  });

  it('records a document when the provider reports local changes', () => {
    const { mock, session } = createSession('doc-a');
    sessions.push(session);

    mock.hasLocalChanges = true;
    mock.emit('local-changes', true);

    expect(hasUnsyncedLocalChanges()).toBe(true);
  });

  it('keeps the mark when the session dies still dirty', () => {
    const { mock, session } = createSession('doc-a');
    mock.hasLocalChanges = true;
    mock.emit('local-changes', true);

    session.destroy();

    expect(hasUnsyncedLocalChanges()).toBe(true);
  });

  it('clears the mark only when the provider acknowledges the document', () => {
    const { mock, session } = createSession('doc-a');
    sessions.push(session);
    mock.hasLocalChanges = true;
    mock.emit('local-changes', true);

    mock.hasLocalChanges = false;
    mock.emit('local-changes', false);

    expect(hasUnsyncedLocalChanges()).toBe(false);
  });

  it('does not treat a later attach as an acknowledgement of another document', () => {
    markDocumentUnsynced('doc-a');

    const { session } = createSession('doc-b');
    sessions.push(session);

    expect(hasUnsyncedLocalChanges()).toBe(true);
  });

  it('does not treat remounting the same document as an acknowledgement', () => {
    const first = createSession('doc-a');
    first.mock.hasLocalChanges = true;
    first.mock.emit('local-changes', true);
    first.session.destroy();

    const { session } = createSession('doc-a');
    sessions.push(session);

    expect(hasUnsyncedLocalChanges()).toBe(true);
  });
});
