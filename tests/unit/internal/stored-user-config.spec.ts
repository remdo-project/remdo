import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import type { UserConfigNote } from '@/documents/contracts';
import { DEFAULT_USER_DOCUMENT } from '@/documents/defaults';

describe('stored user config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
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

        constructor() {
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
            '__remdo_user_config__',
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
    expect(listDocuments(eagerUserConfig)).toEqual([DEFAULT_USER_DOCUMENT]);

    startUserConfigRuntime();
    await Promise.resolve();
    await Promise.resolve();

    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.awaitSynced).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(getUserConfigVersion()).toBe(0);
    expect(listDocuments(eagerUserConfig)).toEqual([DEFAULT_USER_DOCUMENT]);

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

        constructor() {
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
          docMap.set('__remdo_user_config__', new Y.Doc());
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
    expect(listDocuments(eagerUserConfig)).toEqual([DEFAULT_USER_DOCUMENT]);

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
    expect(listDocuments(userConfig)).toEqual([DEFAULT_USER_DOCUMENT]);
  });

  it('rebinds the existing handle after a create-document sync failure', async () => {
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

        constructor() {
          createdSessions += 1;
          if (createdSessions === 1) {
            this.awaitSynced.mockResolvedValueOnce();
            this.awaitSynced.mockRejectedValueOnce(new Error('write failed'));
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
          docMap.set('__remdo_user_config__', new Y.Doc());
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
    expect(listDocuments(userConfig)).toEqual([DEFAULT_USER_DOCUMENT]);

    await expect(getUserConfig()).resolves.toBe(userConfig);

    await expect(userConfig.documentList().create('New Document')).rejects.toThrow('write failed');
    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[0]!.awaitSynced).toHaveBeenCalledTimes(2);
    expect(sessionInstances[0]!.destroy).toHaveBeenCalledTimes(1);

    const recoveredDocument = await userConfig.documentList().create('Recovered Document');

    expect(sessionInstances).toHaveLength(2);
    expect(sessionInstances[1]!.connect).toHaveBeenCalledTimes(1);
    expect(sessionInstances[1]!.awaitSynced).toHaveBeenCalledTimes(2);
    expect(sessionInstances[1]!.destroy).not.toHaveBeenCalled();
    expect(recoveredDocument.text()).toBe('Recovered Document');
    expect(listDocuments(userConfig)).toEqual([
      DEFAULT_USER_DOCUMENT,
      { id: recoveredDocument.id(), title: 'Recovered Document' },
    ]);

    const reloadedUserConfig = await getUserConfig();
    expect(listDocuments(reloadedUserConfig)).toEqual([
      DEFAULT_USER_DOCUMENT,
      { id: recoveredDocument.id(), title: 'Recovered Document' },
    ]);
  });
});
