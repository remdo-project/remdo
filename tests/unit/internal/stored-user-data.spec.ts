import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import type { UserDataNote } from '#note-sdk';

const USER_RUNTIME_DOCUMENT = { id: 'userHomeDoc', title: 'Home' } as const;
const USER_SOURCE_SERVER = {
  id: 'source',
  label: 'Source Server',
  baseUrl: 'https://source.example',
} as const;
const USER_DATA_DOC_ID = 'userDataDoc';

interface MockCollabSessionInstance {
  docId: string;
  destroy: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  awaitSynced: ReturnType<typeof vi.fn>;
}

interface MockCollabSessions {
  byDocId: (docId: string) => MockCollabSessionInstance[];
  sessions: MockCollabSessionInstance[];
}

describe('stored user data', () => {
  beforeEach(() => {
    vi.doUnmock('#config');
    vi.resetModules();
    let createdDocumentCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/documents') {
        createdDocumentCount += 1;
        const body = JSON.parse(String(init?.body ?? '{}')) as { title?: string };
        return {
          ok: true,
          json: async () => ({
            id: `createdDoc${createdDocumentCount}`,
            title: body.title ?? 'Created Document',
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          homeDocumentId: USER_RUNTIME_DOCUMENT.id,
          userDataDocumentId: USER_DATA_DOC_ID,
        }),
      };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.localStorage.clear();
  });

  const listDocuments = (userData: UserDataNote) =>
    userData.documents().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }));

  const listSourceServers = (userData: UserDataNote) =>
    userData.sourceServers().children().map((sourceServer) => ({
      id: sourceServer.id(),
      label: sourceServer.text(),
      baseUrl: sourceServer.baseUrl(),
    }));

  const listDocumentSources = (userData: UserDataNote) =>
    userData.documentSources().children().map((source) => ({
      documents: source.documents().children().map((document) => ({
        id: document.id(),
        title: document.text(),
      })),
      id: source.id(),
      label: source.text(),
      local: source.local(),
    }));

  const listDocumentAccess = (userData: UserDataNote, documentId: string) =>
    userData.documents().byId(documentId)?.access().children().map((access) => ({
      email: access.email(),
      granteeUserId: access.granteeUserId(),
      name: access.name(),
      text: access.text(),
    })) ?? [];

  const writeUserDataProjection = (
    doc: Y.Doc,
    documents: Array<{
      access?: Array<{ documentId: string; email: string; granteeUserId: string; name: string | null }>;
      id: string;
      title: string;
    }>,
    sourceServers: Array<{ id: string; label: string; baseUrl: string }> = [],
  ) => {
    const root = doc.getMap<Y.Array<Y.Map<unknown>>>('user-data');
    const entries = new Y.Array<Y.Map<unknown>>();
    for (const document of documents) {
      const entry = new Y.Map<unknown>();
      entry.set('id', document.id);
      entry.set('title', document.title);
      if (document.access) {
        const accessEntries = new Y.Array<Y.Map<unknown>>();
        for (const access of document.access) {
          const accessEntry = new Y.Map<unknown>();
          accessEntry.set('id', access.granteeUserId);
          accessEntry.set('documentId', access.documentId);
          accessEntry.set('email', access.email);
          accessEntry.set('granteeUserId', access.granteeUserId);
          accessEntry.set('name', access.name);
          accessEntries.push([accessEntry]);
        }
        entry.set('access', accessEntries);
      }
      entries.push([entry]);
    }
    root.set('documents', entries);

    const sourceServerEntries = new Y.Array<Y.Map<unknown>>();
    for (const sourceServer of sourceServers) {
      const entry = new Y.Map<unknown>();
      entry.set('id', sourceServer.id);
      entry.set('label', sourceServer.label);
      entry.set('baseUrl', sourceServer.baseUrl);
      sourceServerEntries.push([entry]);
    }
    root.set('source-servers', sourceServerEntries);
  };

  const createUserDataDoc = (
    documents: Array<{
      access?: Array<{ documentId: string; email: string; granteeUserId: string; name: string | null }>;
      id: string;
      title: string;
    }>,
    sourceServers: Array<{ id: string; label: string; baseUrl: string }> = [],
  ) => {
    const doc = new Y.Doc();
    writeUserDataProjection(doc, documents, sourceServers);
    return doc;
  };

  const createMalformedUserDataDoc = () => {
    const doc = new Y.Doc();
    const root = doc.getMap<Y.Array<Y.Map<unknown>>>('user-data');
    const entries = new Y.Array<Y.Map<unknown>>();
    const entry = new Y.Map<unknown>();
    entry.set('id', 'sourceDoc');
    entries.push([entry]);
    root.set('documents', entries);
    return doc;
  };

  const createDeferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((promiseResolve) => {
      resolve = promiseResolve;
    });
    return { promise, resolve };
  };

  const mockCollabSessions = ({
    awaitSynced = () => Promise.resolve(),
    docsById = {},
  }: {
    awaitSynced?: (docId: string, attempt: number) => Promise<void>;
    docsById?: Record<string, Y.Doc> | ((docId: string, attempt: number) => Y.Doc);
  } = {}): MockCollabSessions => {
    const sessions: MockCollabSessionInstance[] = [];
    const sessionsByDocId = new Map<string, MockCollabSessionInstance[]>();
    const attemptsByDocId = new Map<string, number>();

    vi.doMock('#collaboration/session', () => ({
      CollabSession: class MockCollabSession {
        private provider = {
          connect: vi.fn(),
        };

        readonly destroy = vi.fn();
        readonly awaitSynced: ReturnType<typeof vi.fn<() => Promise<void>>>;
        private readonly attempt: number;
        private readonly docId: string;

        constructor(options: { docId: string }) {
          this.docId = options.docId;
          this.attempt = (attemptsByDocId.get(this.docId) ?? 0) + 1;
          attemptsByDocId.set(this.docId, this.attempt);
          this.awaitSynced = vi.fn(() => awaitSynced(this.docId, this.attempt));
          const session = {
            docId: this.docId,
            destroy: this.destroy,
            connect: this.provider.connect,
            awaitSynced: this.awaitSynced,
          };
          sessions.push(session);
          const docSessions = sessionsByDocId.get(this.docId) ?? [];
          docSessions.push(session);
          sessionsByDocId.set(this.docId, docSessions);
        }

        attach(docMap: Map<string, Y.Doc>) {
          const doc = typeof docsById === 'function'
            ? docsById(this.docId, this.attempt)
            : docsById[this.docId] ?? new Y.Doc();
          docMap.set(this.docId, doc);
        }

        getProvider() {
          return this.provider;
        }

        subscribe() {
          return () => {};
        }
      },
    }));

    return {
      byDocId: (docId) => sessionsByDocId.get(docId) ?? [],
      sessions,
    };
  };

  const mockLinkedSourceProjection = ({
    remoteDoc,
    sourceAwaitSynced = () => Promise.resolve(),
  }: {
    remoteDoc: Y.Doc;
    sourceAwaitSynced?: (attempt: number) => Promise<void>;
  }): MockCollabSessions => {
    const localDoc = createUserDataDoc([USER_RUNTIME_DOCUMENT], [USER_SOURCE_SERVER]);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/current-user/source-servers/source/current-user') {
        return {
          ok: true,
          json: async () => ({
            homeDocumentId: 'sourceHome',
            userDataDocumentId: 'sourceUserDataDoc',
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          homeDocumentId: USER_RUNTIME_DOCUMENT.id,
          userDataDocumentId: USER_DATA_DOC_ID,
        }),
      };
    }));
    return mockCollabSessions({
      awaitSynced: (docId, attempt) => docId === 'sourceUserDataDoc'
        ? sourceAwaitSynced(attempt)
        : Promise.resolve(),
      docsById: {
        [USER_DATA_DOC_ID]: localDoc,
        sourceUserDataDoc: remoteDoc,
      },
    });
  };

  const waitForSessionAwait = async (sessions: MockCollabSessionInstance[]) => {
    for (let attempt = 0; attempt < 10 && sessions[0]?.awaitSynced.mock.calls.length !== 1; attempt += 1) {
      await Promise.resolve();
    }

    const session = sessions[0]!;
    expect(sessions).toHaveLength(1);
    expect(session.connect).toHaveBeenCalledTimes(1);
    expect(session.awaitSynced).toHaveBeenCalledTimes(1);
    return session;
  };

  it('starts with an empty document list before the stored session loads', async () => {
    const { getCurrentUserData } = await import('#client/app/documents/stored-user-data');

    expect(listDocuments(getCurrentUserData())).toEqual([]);
  });

  it('retries startup loading after an initial sync failure', async () => {
    vi.useFakeTimers();
    const collab = mockCollabSessions({
      awaitSynced: async (_docId, attempt) => {
        if (attempt === 1) {
          throw new Error('sync failed');
        }
      },
      docsById: (_docId, attempt) => attempt === 1
        ? new Y.Doc()
        : createUserDataDoc([{ id: 'recovered-doc', title: 'Recovered Document' }]),
    });

    const {
      getCurrentUserData,
      getUserDataVersion,
      startUserDataRuntime,
    } = await import('#client/app/documents/stored-user-data');

    const eagerUserData = getCurrentUserData();
    expect(listDocuments(eagerUserData)).toEqual([]);

    startUserDataRuntime();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(collab.sessions).toHaveLength(1);
    expect(collab.sessions[0]!.connect).toHaveBeenCalledTimes(1);
    expect(collab.sessions[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(collab.sessions[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(getUserDataVersion()).toBe(0);
    expect(listDocuments(eagerUserData)).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);

    expect(collab.sessions).toHaveLength(2);
    expect(collab.sessions[1]!.connect).toHaveBeenCalledTimes(1);
    expect(collab.sessions[1]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(collab.sessions[1]!.destroy).not.toHaveBeenCalled();
    expect(getUserDataVersion()).toBe(1);
    expect(listDocuments(eagerUserData)).toEqual([
      { id: 'recovered-doc', title: 'Recovered Document' },
    ]);
  });

  it('destroys the failed startup session before retrying', async () => {
    const collab = mockCollabSessions({
      awaitSynced: async (_docId, attempt) => {
        if (attempt === 1) {
          throw new Error('sync failed');
        }
      },
    });

    const { getCurrentUserData, getUserData } = await import('#client/app/documents/stored-user-data');

    const eagerUserData = getCurrentUserData();
    expect(listDocuments(eagerUserData)).toEqual([]);

    await expect(getUserData()).rejects.toThrow('sync failed');
    expect(collab.sessions).toHaveLength(1);
    expect(collab.sessions[0]!.connect).toHaveBeenCalledTimes(1);
    expect(collab.sessions[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(collab.sessions[0]!.destroy).toHaveBeenCalledTimes(1);

    const userData = await getUserData();

    expect(collab.sessions).toHaveLength(2);
    expect(userData).toBe(eagerUserData);
    expect(collab.sessions[1]!.connect).toHaveBeenCalledTimes(1);
    expect(collab.sessions[1]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(collab.sessions[1]!.destroy).not.toHaveBeenCalled();
    expect(listDocuments(userData)).toEqual([USER_RUNTIME_DOCUMENT]);
  });

  it('keeps the existing handle after a create-document API failure', async () => {
    const doc = createUserDataDoc([USER_RUNTIME_DOCUMENT]);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/documents') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { title?: string };
        if (body.title === 'New Document') {
          return { ok: false, status: 500 };
        }
        const document = {
          id: 'recoveredDoc',
          title: body.title ?? 'Recovered Document',
        };
        writeUserDataProjection(doc, [
          USER_RUNTIME_DOCUMENT,
          document,
        ]);
        return {
          ok: true,
          json: async () => document,
        };
      }

      return {
        ok: true,
        json: async () => ({
          homeDocumentId: USER_RUNTIME_DOCUMENT.id,
          userDataDocumentId: USER_DATA_DOC_ID,
        }),
      };
    }));
    const collab = mockCollabSessions({
      docsById: { [USER_DATA_DOC_ID]: doc },
    });

    const { getCurrentUserData, getUserData } = await import('#client/app/documents/stored-user-data');

    const userData = getCurrentUserData();
    expect(listDocuments(userData)).toEqual([]);

    await expect(getUserData()).resolves.toBe(userData);
    expect(listDocuments(userData)).toEqual([USER_RUNTIME_DOCUMENT]);

    await expect(userData.documents().create('New Document')).rejects.toThrow('Failed to create document: 500');
    expect(collab.sessions).toHaveLength(1);
    expect(collab.sessions[0]!.connect).toHaveBeenCalledTimes(1);
    expect(collab.sessions[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(collab.sessions[0]!.destroy).not.toHaveBeenCalled();

    const recoveredDocument = await userData.documents().create('Recovered Document');

    expect(collab.sessions).toHaveLength(1);
    expect(recoveredDocument.text()).toBe('Recovered Document');
    expect(listDocuments(userData)).toEqual([
      USER_RUNTIME_DOCUMENT,
      { id: recoveredDocument.id(), title: 'Recovered Document' },
    ]);

    const reloadedUserData = await getUserData();
    expect(listDocuments(reloadedUserData)).toEqual([
      USER_RUNTIME_DOCUMENT,
      { id: recoveredDocument.id(), title: 'Recovered Document' },
    ]);
  });

  it('updates the existing handle when the stored user data projection changes', async () => {
    const doc = createUserDataDoc([USER_RUNTIME_DOCUMENT]);
    mockCollabSessions({
      docsById: { [USER_DATA_DOC_ID]: doc },
    });

    const { getUserData } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();
    expect(listDocuments(userData)).toEqual([USER_RUNTIME_DOCUMENT]);
    expect(listSourceServers(userData)).toEqual([]);

    writeUserDataProjection(doc, [
      USER_RUNTIME_DOCUMENT,
      { id: 'remoteDoc', title: 'Remote Document' },
    ], [
      USER_SOURCE_SERVER,
    ]);

    expect(listDocuments(userData)).toEqual([
      USER_RUNTIME_DOCUMENT,
      { id: 'remoteDoc', title: 'Remote Document' },
    ]);
    expect(listSourceServers(userData)).toEqual([USER_SOURCE_SERVER]);
  });

  it('reads document access through the projected document handle', async () => {
    const doc = createUserDataDoc([{
      ...USER_RUNTIME_DOCUMENT,
      access: [{
        documentId: USER_RUNTIME_DOCUMENT.id,
        email: 'bob@example.test',
        granteeUserId: 'bob',
        name: 'Bob',
      }],
    }]);
    mockCollabSessions({
      docsById: { [USER_DATA_DOC_ID]: doc },
    });

    const { getUserData } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();

    expect(listDocumentAccess(userData, USER_RUNTIME_DOCUMENT.id)).toEqual([{
      email: 'bob@example.test',
      granteeUserId: 'bob',
      name: 'Bob',
      text: 'Bob',
    }]);
  });

  it('lists linked source documents through document source groups', async () => {
    const remoteDoc = createUserDataDoc([{ id: 'sourceDoc', title: 'Source Document' }]);
    mockLinkedSourceProjection({ remoteDoc });

    const { getUserData } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();
    for (
      let attempt = 0;
      attempt < 10 && listDocumentSources(userData)[1]?.documents.length !== 1;
      attempt += 1
    ) {
      await Promise.resolve();
    }

    expect(listDocumentSources(userData)).toEqual([
      {
        documents: [USER_RUNTIME_DOCUMENT],
        id: 'local',
        label: 'Current Server',
        local: true,
      },
      {
        documents: [{ id: 'sourceDoc', title: 'Source Document' }],
        id: 'source',
        label: 'Source Server',
        local: false,
      },
    ]);
  });

  it('uses the source home document when a linked source projection has no regular documents', async () => {
    const remoteDoc = createUserDataDoc([]);
    mockLinkedSourceProjection({ remoteDoc });

    const { getUserData } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();
    for (
      let attempt = 0;
      attempt < 10 && listDocumentSources(userData)[1]?.documents.length !== 1;
      attempt += 1
    ) {
      await Promise.resolve();
    }

    expect(listDocumentSources(userData)).toEqual([
      {
        documents: [USER_RUNTIME_DOCUMENT],
        id: 'local',
        label: 'Current Server',
        local: true,
      },
      {
        documents: [{ id: 'sourceHome', title: 'Home' }],
        id: 'source',
        label: 'Source Server',
        local: false,
      },
    ]);
  });

  it('reports linked source loading while the source sync is pending', async () => {
    const sourceSync = createDeferred();
    const remoteDoc = createUserDataDoc([]);
    const collab = mockLinkedSourceProjection({
      remoteDoc,
      sourceAwaitSynced: () => sourceSync.promise,
    });

    const {
      getDocumentSourcesLoading,
      getUserData,
    } = await import('#client/app/documents/stored-user-data');

    await getUserData();
    for (
      let attempt = 0;
      attempt < 10 && collab.byDocId('sourceUserDataDoc')[0]?.awaitSynced.mock.calls.length !== 1;
      attempt += 1
    ) {
      await Promise.resolve();
    }

    expect(getDocumentSourcesLoading()).toBe(true);

    sourceSync.resolve();
    for (
      let attempt = 0;
      attempt < 10 && getDocumentSourcesLoading();
      attempt += 1
    ) {
      await Promise.resolve();
    }

    expect(getDocumentSourcesLoading()).toBe(false);
  });

  it('retries linked source loading after an initial sync failure', async () => {
    vi.useFakeTimers();
    const remoteDoc = createUserDataDoc([{ id: 'sourceDoc', title: 'Source Document' }]);
    const collab = mockLinkedSourceProjection({
      remoteDoc,
      sourceAwaitSynced: async (attempt) => {
        if (attempt === 1) {
          throw new Error('source sync failed');
        }
      },
    });

    const {
      getDocumentSourcesLoading,
      getUserData,
      subscribeUserDataRuntime,
    } = await import('#client/app/documents/stored-user-data');
    const observedLoadingStates: boolean[] = [];
    const unsubscribe = subscribeUserDataRuntime(() => {
      observedLoadingStates.push(getDocumentSourcesLoading());
    });

    const userData = await getUserData();
    for (
      let attempt = 0;
      attempt < 10 && collab.byDocId('sourceUserDataDoc')[0]?.awaitSynced.mock.calls.length !== 1;
      attempt += 1
    ) {
      await Promise.resolve();
    }

    const failedSourceSessions = collab.byDocId('sourceUserDataDoc');
    expect(failedSourceSessions).toHaveLength(1);
    expect(failedSourceSessions[0]!.connect).toHaveBeenCalledTimes(1);
    expect(failedSourceSessions[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(failedSourceSessions[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(getDocumentSourcesLoading()).toBe(true);
    expect(observedLoadingStates).not.toContain(false);
    expect(listDocumentSources(userData)[1]?.documents).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    for (
      let attempt = 0;
      attempt < 10 && listDocumentSources(userData)[1]?.documents.length !== 1;
      attempt += 1
    ) {
      await Promise.resolve();
    }

    const sourceSessions = collab.byDocId('sourceUserDataDoc');
    expect(sourceSessions).toHaveLength(2);
    expect(sourceSessions[1]!.connect).toHaveBeenCalledTimes(1);
    expect(sourceSessions[1]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sourceSessions[1]!.destroy).not.toHaveBeenCalled();
    expect(getDocumentSourcesLoading()).toBe(false);
    expect(listDocumentSources(userData)[1]?.documents).toEqual([
      { id: 'sourceDoc', title: 'Source Document' },
    ]);
    unsubscribe();
  });

  it('skips malformed linked source projection entries without stopping the source session', async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const collab = mockLinkedSourceProjection({
      remoteDoc: createMalformedUserDataDoc(),
    });

    const {
      getDocumentSourcesLoading,
      getUserData,
    } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();
    for (let attempt = 0; attempt < 10 && getDocumentSourcesLoading(); attempt += 1) {
      await Promise.resolve();
    }

    const sourceSessions = collab.byDocId('sourceUserDataDoc');
    expect(sourceSessions).toHaveLength(1);
    expect(sourceSessions[0]!.connect).toHaveBeenCalledTimes(1);
    expect(sourceSessions[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sourceSessions[0]!.destroy).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to read projection collection "documents" entry.',
      expect.any(TypeError),
    );
    expect(getDocumentSourcesLoading()).toBe(false);
    expect(listDocumentSources(userData)[1]?.documents).toEqual([
      { id: 'sourceHome', title: 'Home' },
    ]);
  });

  it('destroys a pending linked source session when the source is unlinked', async () => {
    const sourceSync = createDeferred();
    const localDoc = createUserDataDoc([USER_RUNTIME_DOCUMENT], [USER_SOURCE_SERVER]);
    const remoteDoc = createUserDataDoc([{ id: 'sourceDoc', title: 'Source Document' }]);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/current-user/source-servers/source/current-user') {
        return {
          ok: true,
          json: async () => ({
            homeDocumentId: 'sourceHome',
            userDataDocumentId: 'sourceUserDataDoc',
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          homeDocumentId: USER_RUNTIME_DOCUMENT.id,
          userDataDocumentId: USER_DATA_DOC_ID,
        }),
      };
    }));
    const collab = mockCollabSessions({
      awaitSynced: (docId) => docId === 'sourceUserDataDoc' ? sourceSync.promise : Promise.resolve(),
      docsById: {
        [USER_DATA_DOC_ID]: localDoc,
        sourceUserDataDoc: remoteDoc,
      },
    });

    const { getUserData } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();
    for (
      let attempt = 0;
      attempt < 10 && collab.byDocId('sourceUserDataDoc')[0]?.awaitSynced.mock.calls.length !== 1;
      attempt += 1
    ) {
      await Promise.resolve();
    }

    const sourceSession = collab.byDocId('sourceUserDataDoc')[0]!;
    expect(sourceSession.connect).toHaveBeenCalledTimes(1);
    expect(sourceSession.awaitSynced).toHaveBeenCalledTimes(1);

    // Unlinking removes the source from the user's projection entirely (the
    // projection only lists sources the user has linked).
    writeUserDataProjection(localDoc, [USER_RUNTIME_DOCUMENT], []);

    expect(sourceSession.destroy).toHaveBeenCalledTimes(1);
    expect(listDocumentSources(userData)).toEqual([{
      documents: [USER_RUNTIME_DOCUMENT],
      id: 'local',
      label: 'Current Server',
      local: true,
    }]);

    sourceSync.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sourceSession.destroy).toHaveBeenCalledTimes(1);
  });

  it('waits for initial loading and lists created documents from the stored projection', async () => {
    const sync = createDeferred();
    const doc = createUserDataDoc([USER_RUNTIME_DOCUMENT]);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/documents') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { title?: string };
        const document = {
          id: 'createdDoc',
          title: body.title ?? 'Created Document',
        };
        writeUserDataProjection(doc, [
          USER_RUNTIME_DOCUMENT,
          document,
        ]);
        return {
          ok: true,
          json: async () => document,
        };
      }

      return {
        ok: true,
        json: async () => ({
          homeDocumentId: USER_RUNTIME_DOCUMENT.id,
          userDataDocumentId: USER_DATA_DOC_ID,
        }),
      };
    }));
    mockCollabSessions({
      awaitSynced: () => sync.promise,
      docsById: { [USER_DATA_DOC_ID]: doc },
    });

    const { getCurrentUserData, startUserDataRuntime } = await import('#client/app/documents/stored-user-data');
    const userData = getCurrentUserData();

    startUserDataRuntime();
    const createdPromise = userData.documents().create('New Document');
    await Promise.resolve();
    await Promise.resolve();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/documents')).toHaveLength(0);
    expect(listDocuments(userData)).toEqual([]);

    sync.resolve();
    const createdDocument = await createdPromise;

    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/documents')).toHaveLength(1);
    expect(listDocuments(userData)).toEqual([
      USER_RUNTIME_DOCUMENT,
      { id: createdDocument.id(), title: 'New Document' },
    ]);
  });

  it('uses the user-specific home document for an empty stored user data projection', async () => {
    mockCollabSessions({
      docsById: { [USER_DATA_DOC_ID]: createUserDataDoc([]) },
    });

    const { getUserData } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();

    expect(listDocuments(userData)).toEqual([USER_RUNTIME_DOCUMENT]);
  });

  it('destroys a pending user data session when reset races with startup sync', async () => {
    const sync = createDeferred();
    const collab = mockCollabSessions({ awaitSynced: () => sync.promise });

    const {
      getUserData,
      resetUserDataRuntime,
    } = await import('#client/app/documents/stored-user-data');

    const startupPromise = getUserData();
    const session = await waitForSessionAwait(collab.sessions);

    resetUserDataRuntime();

    expect(session.destroy).toHaveBeenCalledTimes(1);

    sync.resolve();

    await expect(startupPromise).rejects.toThrow('User data runtime was reset.');
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  it('resets the live user data session and document list', async () => {
    const collab = mockCollabSessions({
      docsById: { [USER_DATA_DOC_ID]: createUserDataDoc([USER_RUNTIME_DOCUMENT]) },
    });

    const {
      getCurrentUserData,
      getUserData,
      resetUserDataRuntime,
    } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();
    expect(userData).toBe(getCurrentUserData());
    expect(listDocuments(userData)).toEqual([USER_RUNTIME_DOCUMENT]);

    resetUserDataRuntime();

    expect(collab.sessions).toHaveLength(1);
    expect(collab.sessions[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(listDocuments(userData)).toEqual([]);
    expect(getCurrentUserData()).toBe(userData);
  });
});
