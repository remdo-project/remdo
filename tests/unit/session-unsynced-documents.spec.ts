import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { CollabSession } from '#collaboration/session';
import {
  clearUnsyncedLocalChanges,
  hasUnsyncedLocalChanges,
  markDocumentUnsynced,
} from '#collaboration/unsynced-local-changes';
import { createMockProvider, createMockProviderFactory } from './collab/_support/mock-provider';

function createSession(docId: string) {
  const docMap = new Map<string, Y.Doc>([[docId, new Y.Doc()]]);
  const mock = createMockProvider();
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
