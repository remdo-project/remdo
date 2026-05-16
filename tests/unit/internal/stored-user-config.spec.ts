import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import type { UserConfigNote } from '@/documents/contracts';
import { HOME_USER_DOCUMENT } from '@/documents/defaults';

const USER_RUNTIME_DOCUMENT = { id: 'userDefaultDoc', title: 'Main' } as const;
const USER_CONFIG_DOC_ID = 'userConfigDoc';

describe('stored user config', () => {
  beforeEach(() => {
    vi.doUnmock('#config');
    vi.resetModules();
    let createdDocumentCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/profile/documents') {
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
          configDocumentId: USER_CONFIG_DOC_ID,
        }),
      };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const listDocuments = (userConfig: UserConfigNote) =>
    userConfig.documentList().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }));

  const createUserConfigDoc = (documents: Array<{ id: string; title: string }>) => {
    const doc = new Y.Doc();
    const root = doc.getMap<Y.Array<Y.Map<unknown>>>('user-config');
    const entries = new Y.Array<Y.Map<unknown>>();
    for (const document of documents) {
      const entry = new Y.Map<unknown>();
      entry.set('id', document.id);
      entry.set('title', document.title);
      entries.push([entry]);
    }
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

  it('seeds the configured home document before the stored session loads', async () => {
    vi.doMock('#config', () => ({
      config: {
        env: {
          COLLAB_DOCUMENT_ID: 'dockerSmoke',
        },
      },
    }));

    const { getCurrentUserConfig } = await import('@/documents/stored-user-config');

    expect(listDocuments(getCurrentUserConfig())).toEqual([
      { id: 'dockerSmoke', title: 'Main' },
    ]);
  });

  it('retries startup loading after an initial sync failure', async () => {
    vi.useFakeTimers();
    let createdSessions = 0;
    const sessionInstances: Array<{
      destroy: ReturnType<typeof vi.fn>;
      connect: ReturnType<typeof vi.fn>;
      awaitSynced: ReturnType<typeof vi.fn>;
    }> = [];

    vi.doMock('#lib/collaboration/session', () => ({
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
              : createUserConfigDoc([{ id: 'recovered-doc', title: 'Recovered Document' }]),
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
      getCurrentUserConfig,
      getUserConfigVersion,
      startUserConfigRuntime,
    } = await import('@/documents/stored-user-config');

    const eagerUserConfig = getCurrentUserConfig();
    expect(listDocuments(eagerUserConfig)).toEqual([HOME_USER_DOCUMENT]);

    startUserConfigRuntime();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(getUserConfigVersion()).toBe(0);
    expect(listDocuments(eagerUserConfig)).toEqual([HOME_USER_DOCUMENT]);

    await vi.advanceTimersByTimeAsync(1000);

    expect(sessionInstances).toHaveLength(2);
    expect(sessionInstances[1]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[1]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sessionInstances[1]!.destroy).not.toHaveBeenCalled();
    expect(getUserConfigVersion()).toBe(1);
    expect(listDocuments(eagerUserConfig)).toEqual([
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

    vi.doMock('#lib/collaboration/session', () => ({
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

    const { getCurrentUserConfig, getUserConfig } = await import('@/documents/stored-user-config');

    const eagerUserConfig = getCurrentUserConfig();
    expect(listDocuments(eagerUserConfig)).toEqual([HOME_USER_DOCUMENT]);

    await expect(getUserConfig()).rejects.toThrow('sync failed');
    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.destroy).toHaveBeenCalledTimes(1);

    const userConfig = await getUserConfig();

    expect(sessionInstances).toHaveLength(2);
    expect(userConfig).toBe(eagerUserConfig);
    expect(sessionInstances[1]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[1]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sessionInstances[1]!.destroy).not.toHaveBeenCalled();
    expect(listDocuments(userConfig)).toEqual([USER_RUNTIME_DOCUMENT]);
  });

  it('keeps the existing handle after a create-document API failure', async () => {
    const sessionInstances: Array<{
      destroy: ReturnType<typeof vi.fn>;
      connect: ReturnType<typeof vi.fn>;
      awaitSynced: ReturnType<typeof vi.fn>;
    }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/profile/documents') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { title?: string };
        if (body.title === 'New Document') {
          return { ok: false, status: 500 };
        }
        return {
          ok: true,
          json: async () => ({
            id: 'recoveredDoc',
            title: body.title ?? 'Recovered Document',
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          homeDocumentId: USER_RUNTIME_DOCUMENT.id,
          configDocumentId: USER_CONFIG_DOC_ID,
        }),
      };
    }));

    vi.doMock('#lib/collaboration/session', () => ({
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
          docMap.set(this.docId, createUserConfigDoc([USER_RUNTIME_DOCUMENT]));
        }

        getProvider() {
          return this.provider;
        }

        subscribe() {
          return () => {};
        }
      },
    }));

    const { getCurrentUserConfig, getUserConfig } = await import('@/documents/stored-user-config');

    const userConfig = getCurrentUserConfig();
    expect(listDocuments(userConfig)).toEqual([HOME_USER_DOCUMENT]);

    await expect(getUserConfig()).resolves.toBe(userConfig);
    expect(listDocuments(userConfig)).toEqual([USER_RUNTIME_DOCUMENT]);

    await expect(userConfig.documentList().create('New Document')).rejects.toThrow('Failed to create document: 500');
    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.destroy).not.toHaveBeenCalled();

    const recoveredDocument = await userConfig.documentList().create('Recovered Document');

    expect(sessionInstances).toHaveLength(1);
    expect(recoveredDocument.text()).toBe('Recovered Document');
    expect(listDocuments(userConfig)).toEqual([
      USER_RUNTIME_DOCUMENT,
      { id: recoveredDocument.id(), title: 'Recovered Document' },
    ]);

    const reloadedUserConfig = await getUserConfig();
    expect(listDocuments(reloadedUserConfig)).toEqual([
      USER_RUNTIME_DOCUMENT,
      { id: recoveredDocument.id(), title: 'Recovered Document' },
    ]);
  });

  it('waits for initial config loading before creating a document', async () => {
    const sync = createDeferred();
    vi.doMock('#lib/collaboration/session', () => ({
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
          docMap.set(this.docId, createUserConfigDoc([USER_RUNTIME_DOCUMENT]));
        }

        getProvider() {
          return this.provider;
        }

        subscribe() {
          return () => {};
        }
      },
    }));

    const { getCurrentUserConfig, startUserConfigRuntime } = await import('@/documents/stored-user-config');
    const userConfig = getCurrentUserConfig();

    startUserConfigRuntime();
    const createdPromise = userConfig.documentList().create('New Document');
    await Promise.resolve();
    await Promise.resolve();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/profile/documents')).toHaveLength(0);
    expect(listDocuments(userConfig)).toEqual([HOME_USER_DOCUMENT]);

    sync.resolve();
    const createdDocument = await createdPromise;

    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/profile/documents')).toHaveLength(1);
    expect(listDocuments(userConfig)).toEqual([
      USER_RUNTIME_DOCUMENT,
      { id: createdDocument.id(), title: 'New Document' },
    ]);
  });

  it('uses the user-specific home document for an empty stored config projection', async () => {
    vi.doMock('#lib/collaboration/session', () => ({
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
          docMap.set(this.docId, createUserConfigDoc([]));
        }

        getProvider() {
          return this.provider;
        }

        subscribe() {
          return () => {};
        }
      },
    }));

    const { getUserConfig } = await import('@/documents/stored-user-config');

    const userConfig = await getUserConfig();

    expect(listDocuments(userConfig)).toEqual([USER_RUNTIME_DOCUMENT]);
  });
});
