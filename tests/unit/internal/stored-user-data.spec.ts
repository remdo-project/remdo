import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import type { UserDataNote } from '#note-sdk';

const USER_RUNTIME_DOCUMENT = { id: 'userHomeDoc', title: 'Home' } as const;
const USER_SOURCE_SERVER = {
  id: 'source',
  label: 'Source Server',
  baseUrl: 'https://source.example',
  linked: false,
} as const;
const USER_DATA_DOC_ID = 'userDataDoc';

interface MockCollabSessionInstance {
  destroy: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  awaitSynced: ReturnType<typeof vi.fn>;
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
    vi.unstubAllGlobals();
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
      linked: sourceServer.linked(),
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
    sourceServers: Array<{ id: string; label: string; baseUrl: string; linked: boolean }> = [],
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
      entry.set('linked', sourceServer.linked);
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
    sourceServers: Array<{ id: string; label: string; baseUrl: string; linked: boolean }> = [],
  ) => {
    const doc = new Y.Doc();
    writeUserDataProjection(doc, documents, sourceServers);
    return doc;
  };

  const createDeferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((promiseResolve) => {
      resolve = promiseResolve;
    });
    return { promise, resolve };
  };

  const mockCollabSession = ({
    awaitSynced = () => Promise.resolve(),
    doc = new Y.Doc(),
  }: {
    awaitSynced?: () => Promise<void>;
    doc?: Y.Doc;
  } = {}) => {
    const sessions: MockCollabSessionInstance[] = [];

    vi.doMock('#collaboration/session', () => ({
      CollabSession: class MockCollabSession {
        private provider = {
          connect: vi.fn(),
        };

        readonly destroy = vi.fn();
        readonly awaitSynced = vi.fn(awaitSynced);
        private readonly docId: string;

        constructor(options: { docId: string }) {
          this.docId = options.docId;
          sessions.push({
            destroy: this.destroy,
            connect: this.provider.connect,
            awaitSynced: this.awaitSynced,
          });
        }

        attach(docMap: Map<string, Y.Doc>) {
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

    return sessions;
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
    let createdSessions = 0;
    const sessionInstances: Array<{
      destroy: ReturnType<typeof vi.fn>;
      connect: ReturnType<typeof vi.fn>;
      awaitSynced: ReturnType<typeof vi.fn>;
    }> = [];

    vi.doMock('#collaboration/session', () => ({
      CollabSession: class MockCollabSession {
        private provider = {
          connect: vi.fn(),
        };

        readonly destroy = vi.fn();
        readonly awaitSynced = vi.fn<() => Promise<void>>();
        private readonly sessionNumber: number;
        private readonly docId: string;

        constructor(options: { docId: string }) {
          this.docId = options.docId;
          createdSessions += 1;
          this.sessionNumber = createdSessions;
          if (this.sessionNumber === 1) {
            this.awaitSynced.mockRejectedValueOnce(new Error('sync failed'));
          } else {
            this.awaitSynced.mockResolvedValue();
          }
          sessionInstances.push({
            destroy: this.destroy,
            connect: this.provider.connect,
            awaitSynced: this.awaitSynced,
          });
        }

        attach(docMap: Map<string, Y.Doc>) {
          docMap.set(
            this.docId,
            this.sessionNumber === 1
              ? new Y.Doc()
              : createUserDataDoc([{ id: 'recovered-doc', title: 'Recovered Document' }]),
          );
        }

        getProvider() {
          return this.provider;
        }

        subscribe() {
          return () => {};
        }
      },
    }));

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

    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(getUserDataVersion()).toBe(0);
    expect(listDocuments(eagerUserData)).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);

    expect(sessionInstances).toHaveLength(2);
    expect(sessionInstances[1]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[1]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sessionInstances[1]!.destroy).not.toHaveBeenCalled();
    expect(getUserDataVersion()).toBe(1);
    expect(listDocuments(eagerUserData)).toEqual([
      { id: 'recovered-doc', title: 'Recovered Document' },
    ]);
  });

  it('destroys the failed startup session before retrying', async () => {
    let createdSessions = 0;
    const sessionInstances: Array<{
      destroy: ReturnType<typeof vi.fn>;
      connect: ReturnType<typeof vi.fn>;
      awaitSynced: ReturnType<typeof vi.fn>;
    }> = [];

    vi.doMock('#collaboration/session', () => ({
      CollabSession: class MockCollabSession {
        private provider = {
          connect: vi.fn(),
        };

        readonly destroy = vi.fn();
        readonly awaitSynced = vi.fn<() => Promise<void>>();
        private readonly docId: string;

        constructor(options: { docId: string }) {
          this.docId = options.docId;
          createdSessions += 1;
          if (createdSessions === 1) {
            this.awaitSynced.mockRejectedValueOnce(new Error('sync failed'));
          } else {
            this.awaitSynced.mockResolvedValue();
          }
          sessionInstances.push({
            destroy: this.destroy,
            connect: this.provider.connect,
            awaitSynced: this.awaitSynced,
          });
        }

        attach(docMap: Map<string, Y.Doc>) {
          docMap.set(this.docId, new Y.Doc());
        }

        getProvider() {
          return this.provider;
        }

        subscribe() {
          return () => {};
        }
      },
    }));

    const { getCurrentUserData, getUserData } = await import('#client/app/documents/stored-user-data');

    const eagerUserData = getCurrentUserData();
    expect(listDocuments(eagerUserData)).toEqual([]);

    await expect(getUserData()).rejects.toThrow('sync failed');
    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.destroy).toHaveBeenCalledTimes(1);

    const userData = await getUserData();

    expect(sessionInstances).toHaveLength(2);
    expect(userData).toBe(eagerUserData);
    expect(sessionInstances[1]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[1]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sessionInstances[1]!.destroy).not.toHaveBeenCalled();
    expect(listDocuments(userData)).toEqual([USER_RUNTIME_DOCUMENT]);
  });

  it('keeps the existing handle after a create-document API failure', async () => {
    const doc = createUserDataDoc([USER_RUNTIME_DOCUMENT]);
    const sessionInstances: Array<{
      destroy: ReturnType<typeof vi.fn>;
      connect: ReturnType<typeof vi.fn>;
      awaitSynced: ReturnType<typeof vi.fn>;
    }> = [];
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

    vi.doMock('#collaboration/session', () => ({
      CollabSession: class MockCollabSession {
        private provider = {
          connect: vi.fn(),
        };

        readonly destroy = vi.fn();
        readonly awaitSynced = vi.fn<() => Promise<void>>();
        private readonly docId: string;

        constructor(options: { docId: string }) {
          this.docId = options.docId;
          this.awaitSynced.mockResolvedValue();
          sessionInstances.push({
            destroy: this.destroy,
            connect: this.provider.connect,
            awaitSynced: this.awaitSynced,
          });
        }

        attach(docMap: Map<string, Y.Doc>) {
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

    const { getCurrentUserData, getUserData } = await import('#client/app/documents/stored-user-data');

    const userData = getCurrentUserData();
    expect(listDocuments(userData)).toEqual([]);

    await expect(getUserData()).resolves.toBe(userData);
    expect(listDocuments(userData)).toEqual([USER_RUNTIME_DOCUMENT]);

    await expect(userData.documents().create('New Document')).rejects.toThrow('Failed to create document: 500');
    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.destroy).not.toHaveBeenCalled();

    const recoveredDocument = await userData.documents().create('Recovered Document');

    expect(sessionInstances).toHaveLength(1);
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
    mockCollabSession({ doc });

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
    mockCollabSession({ doc });

    const { getUserData } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();

    expect(listDocumentAccess(userData, USER_RUNTIME_DOCUMENT.id)).toEqual([{
      email: 'bob@example.test',
      granteeUserId: 'bob',
      name: 'Bob',
      text: 'Bob',
    }]);
  });

  it('links source servers through the projected handle without optimistic local changes', async () => {
    const doc = createUserDataDoc([USER_RUNTIME_DOCUMENT], [USER_SOURCE_SERVER]);
    const linkSourceServerAccount = vi.fn(async () => {});
    vi.doMock('#client/app/auth/source-server-linking-client', () => ({
      linkSourceServerAccount,
    }));
    mockCollabSession({ doc });

    const { getUserData } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();
    const sourceServer = userData.sourceServers().byId('source')!;

    await sourceServer.link();

    expect(linkSourceServerAccount).toHaveBeenCalledWith('source');
    expect(listSourceServers(userData)).toEqual([USER_SOURCE_SERVER]);
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
    vi.doMock('#collaboration/session', () => ({
      CollabSession: class MockCollabSession {
        private provider = {
          connect: vi.fn(),
        };

        readonly destroy = vi.fn();
        readonly awaitSynced = vi.fn(() => sync.promise);
        private readonly docId: string;

        constructor(options: { docId: string }) {
          this.docId = options.docId;
        }

        attach(docMap: Map<string, Y.Doc>) {
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
    vi.doMock('#collaboration/session', () => ({
      CollabSession: class MockCollabSession {
        private provider = {
          connect: vi.fn(),
        };

        readonly destroy = vi.fn();
        readonly awaitSynced = vi.fn<() => Promise<void>>().mockResolvedValue();
        private readonly docId: string;

        constructor(options: { docId: string }) {
          this.docId = options.docId;
        }

        attach(docMap: Map<string, Y.Doc>) {
          docMap.set(this.docId, createUserDataDoc([]));
        }

        getProvider() {
          return this.provider;
        }

        subscribe() {
          return () => {};
        }
      },
    }));

    const { getUserData } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();

    expect(listDocuments(userData)).toEqual([USER_RUNTIME_DOCUMENT]);
  });

  it('destroys a pending user data session when reset races with startup sync', async () => {
    const sync = createDeferred();
    const sessions = mockCollabSession({ awaitSynced: () => sync.promise });

    const {
      getUserData,
      resetUserDataRuntime,
    } = await import('#client/app/documents/stored-user-data');

    const startupPromise = getUserData();
    const session = await waitForSessionAwait(sessions);

    resetUserDataRuntime();

    expect(session.destroy).toHaveBeenCalledTimes(1);

    sync.resolve();

    await expect(startupPromise).rejects.toThrow('User data runtime was reset.');
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  it('resets the live user data session and document list', async () => {
    const sessionInstances: Array<{
      destroy: ReturnType<typeof vi.fn>;
    }> = [];

    vi.doMock('#collaboration/session', () => ({
      CollabSession: class MockCollabSession {
        private provider = {
          connect: vi.fn(),
        };

        readonly destroy = vi.fn();
        readonly awaitSynced = vi.fn<() => Promise<void>>().mockResolvedValue();
        private readonly docId: string;

        constructor(options: { docId: string }) {
          this.docId = options.docId;
          sessionInstances.push({ destroy: this.destroy });
        }

        attach(docMap: Map<string, Y.Doc>) {
          docMap.set(this.docId, createUserDataDoc([USER_RUNTIME_DOCUMENT]));
        }

        getProvider() {
          return this.provider;
        }

        subscribe() {
          return () => {};
        }
      },
    }));

    const {
      getCurrentUserData,
      getUserData,
      resetUserDataRuntime,
    } = await import('#client/app/documents/stored-user-data');

    const userData = await getUserData();
    expect(userData).toBe(getCurrentUserData());
    expect(listDocuments(userData)).toEqual([USER_RUNTIME_DOCUMENT]);

    resetUserDataRuntime();

    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(listDocuments(userData)).toEqual([]);
    expect(getCurrentUserData()).toBe(userData);
  });
});
