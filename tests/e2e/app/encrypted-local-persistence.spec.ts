import { expect, signOutFromHeader, test } from '#e2e/fixtures';
import { createUserDocument } from '../_support/documents';
import { ensureReady, waitForSynced } from '../editor/_support/bridge';

test('encrypted cache survives compaction and teardown without plaintext storage', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
    const { createLocalPersistence, Doc } = await import(fixturePath);
    const doc = new Doc();
    const peer = new Doc();
    const accountId = crypto.randomUUID();
    const cache = createLocalPersistence('cache-test', doc, { accountId });
    const peerCache = createLocalPersistence('cache-test', peer, { accountId });
    await Promise.all([cache.whenSynced, peerCache.whenSynced]);
    for (let index = 0; index < 80; index += 1) {
      doc.getMap('private').set(`a${index}`, 'PRIVATE_CACHE_CONTENT');
      peer.getMap('private').set(`b${index}`, 'PRIVATE_CACHE_CONTENT');
    }
    // destroy itself is the persistence barrier for queued updates.
    await Promise.all([cache.destroy(), peerCache.destroy()]);
    const restored = new Doc();
    const reopened = createLocalPersistence('cache-test', restored, { accountId });
    await reopened.whenSynced;
    const size = restored.getMap('private').size;
    await reopened.destroy();
    const databases = await indexedDB.databases();
    const name = databases.find((database) => database.name?.includes(accountId))!.name!;
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
    });
    const records = await new Promise<Array<{ ciphertext: ArrayBuffer }>>((resolve) => {
      const request = database.transaction('updates').objectStore('updates').getAll();
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    return { size, compacted: records.length < 64, plaintext: records.some((record) =>
      new TextDecoder().decode(record.ciphertext).includes('PRIVATE_CACHE_CONTENT')) };
  });
  expect(result).toEqual({ size: 160, compacted: true, plaintext: false });
});

test('logout revokes keys before a blocked cache deletion', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
    const { createLocalPersistence, LOCAL_PERSISTENCE_KEY_PREFIX, clearLocalUserData, Doc } = await import(fixturePath);
    const accountId = crypto.randomUUID();
    const doc = new Doc();
    let revoked = false;
    const cache = createLocalPersistence('logout-test', doc, { accountId, onRevoked: () => { revoked = true; } });
    await cache.whenSynced;
    doc.getMap('private').set('secret', 'private');
    await cache.flush();
    const name = (await indexedDB.databases()).find((database) => database.name?.includes(accountId))!.name!;
    const held = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
    });
    const clearing = clearLocalUserData();
    const keyRemovedImmediately = localStorage.getItem(`${LOCAL_PERSISTENCE_KEY_PREFIX}${accountId}`) === null;
    const failed = await clearing.then(() => false, () => true);
    held.close();
    return { keyRemovedImmediately, revoked, failed };
  });
  expect(result).toEqual({ keyRemovedImmediately: true, revoked: true, failed: true });
});

test('two tabs share encrypted updates and both stop on logout', async ({ page, context }) => {
  const peer = await context.newPage();
  await Promise.all([page.goto('/'), peer.goto('/')]);
  const accountId = `cross-tab-${Date.now()}`;
  for (const tab of [page, peer]) {
    await tab.evaluate(async (accountId) => {
      const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
      await (await import(fixturePath)).open(accountId);
    }, accountId);
  }
  await page.evaluate(async () => {
    const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
    await (await import(fixturePath)).write('offline peer update');
  });
  await expect.poll(() => peer.evaluate(async () => {
    const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
    return (await import(fixturePath)).read().text;
  })).toBe('offline peer update');
  await page.evaluate(async () => {
    const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
    // Key removal is sufficient even if deletion races the sibling tab closing.
    await (await import(fixturePath)).clearLocalUserData().catch(() => {});
  });
  await expect.poll(() => peer.evaluate(async () => {
    const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
    return (await import(fixturePath)).read().revoked;
  })).toBe(true);
  await peer.close();
});

test('rejects a whole corrupted cache and recovers from the authorized server', async ({ page }) => {
  const { id } = await createUserDocument(page, 'Corrupt cache recovery');
  await page.goto('/');
  const result = await page.evaluate(async (docId) => {
    const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
    const runtimePath = '/src/collaboration/runtime.ts';
    const { createLocalPersistence, Doc, clearLocalUserData } = await import(fixturePath);
    const { createProviderFactory, waitForSync } = await import(runtimePath);
    const source = createProviderFactory()(docId, new Map());
    await source.provider.connect();
    await waitForSync(source.provider);
    source.doc.getMap('server').set('text', 'Authorized server content');
    await waitForSync(source.provider);
    const accountId = crypto.randomUUID();
    const doc = new Doc();
    const cache = createLocalPersistence(docId, doc, { accountId });
    await cache.whenSynced;
    doc.getText('private').insert(0, 'partial cache must never reach server');
    await cache.flush();
    doc.getMap('tail').set('value', 'last encrypted update');
    await cache.destroy();
    const name = (await indexedDB.databases()).find((database) => database.name?.includes(accountId))!.name!;
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
    });
    let corruptedBytes: string;
    await new Promise<void>((resolve) => {
      const transaction = database.transaction('updates', 'readwrite');
      const request = transaction.objectStore('updates').openCursor(null, 'prev');
      request.onsuccess = () => {
        const cursor = request.result!;
        const record = cursor.value as { ciphertext: ArrayBuffer };
        const bytes = new Uint8Array(record.ciphertext);
        bytes[0] = bytes[0]! ^ 1;
        corruptedBytes = Array.from(bytes).join(',');
        cursor.update(record);
      };
      transaction.oncomplete = () => resolve();
    });
    const restored = new Doc();
    let reported = false;
    const reopened = createLocalPersistence(docId, restored, { accountId, onError: () => { reported = true; } });
    const rejected = await reopened.whenSynced.then(() => false, () => true);
    await reopened.destroy().catch(() => {});
    const recovered = createProviderFactory({ accountId })(docId, new Map());
    await recovered.provider.connect();
    await waitForSync(recovered.provider);
    const corruptionRetained = await new Promise<boolean>((resolve) => {
      const request = database.transaction('updates').objectStore('updates').openCursor(null, 'prev');
      request.onsuccess = () => resolve(Array.from(new Uint8Array(request.result!.value.ciphertext)).join(',') === corruptedBytes);
    });
    const result = {
      rejected, reported, corruptionRetained,
      localContent: restored.getText('private').toString(),
      recoveredContent: recovered.doc.getMap('server').get('text'),
      leakedContent: source.doc.getText('private').toString(),
      cacheStatus: recovered.provider.localPersistenceStatus,
      connectionStatus: recovered.provider.status,
    };
    recovered.provider.destroy();
    source.provider.destroy();
    database.close();
    await clearLocalUserData();
    return result;
  }, id);
  expect(result).toEqual({
    rejected: true, reported: true, corruptionRetained: true,
    localContent: '', recoveredContent: 'Authorized server content', leakedContent: '',
    cacheStatus: 'error', connectionStatus: 'connected',
  });
});

test('logout revokes a destroyed cache while key generation is still pending', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
    const persistencePath = '/src/collaboration/local-persistence.ts';
    const { openDeferredCache, finishDeferredCache } = await import(fixturePath);
    const { revokeLocalPersistenceKeys } = await import(persistencePath);
    await openDeferredCache(crypto.randomUUID());
    const revoked = revokeLocalPersistenceKeys();
    const result = await finishDeferredCache();
    await revoked;
    return result;
  });
  expect(result).toEqual({ revocations: 1, keyRemains: false, databaseRemains: false });
});

test('peer logout revokes a destroyed cache before its first key exists', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  const peer = await context.newPage();
  await peer.goto('/');
  await expect(peer.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await peer.evaluate(async () => {
    const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
    await (await import(fixturePath)).openDeferredCache(crypto.randomUUID());
  });
  await signOutFromHeader(page);
  await expect(peer.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  const result = await peer.evaluate(async () => {
    const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
    return (await import(fixturePath)).finishDeferredCache();
  });
  expect(result).toEqual({ revocations: 1, keyRemains: false, databaseRemains: false });
  await peer.close();
});

for (const failure of ['malformed-key', 'database-open'] as const) {
  test(`online collaboration survives ${failure} cache startup failure`, async ({ page }) => {
    const { id } = await createUserDocument(page, 'Cache failure recovery');
    await page.goto('/');
    const result = await page.evaluate(async ({ docId, failure }) => {
      const runtimePath = '/src/collaboration/runtime.ts';
      const { createProviderFactory, waitForSync } = await import(runtimePath);
      const source = createProviderFactory()(docId, new Map());
      await source.provider.connect();
      await waitForSync(source.provider);
      source.doc.getMap('content').set('text', 'Verified server content');
      await waitForSync(source.provider);
      const accountId = crypto.randomUUID();
      const keyName = `remdo-encrypted-v1-key:${accountId}`;
      const openDescriptor = Object.getOwnPropertyDescriptor(indexedDB, 'open');
      const open = indexedDB.open.bind(indexedDB);
      if (failure === 'malformed-key') localStorage.setItem(keyName, '{invalid');
      else Object.defineProperty(indexedDB, 'open', {
        configurable: true,
        value: (name: string, version?: number) => {
          if (name.startsWith('remdo-encrypted-v1-')) throw new DOMException('Storage blocked', 'UnknownError');
          return open(name, version);
        },
      });
      const restored = createProviderFactory({ accountId })(docId, new Map());
      try {
        await restored.provider.connect();
        await waitForSync(restored.provider).catch(() => {});
        return {
          content: restored.doc.getMap('content').get('text') ?? null,
          status: restored.provider.status,
          cacheStatus: restored.provider.localPersistenceStatus ?? null,
          malformedKeyUnchanged: failure !== 'malformed-key' || localStorage.getItem(keyName) === '{invalid',
        };
      } finally {
        restored.provider.destroy();
        source.provider.destroy();
        if (openDescriptor) Object.defineProperty(indexedDB, 'open', openDescriptor);
        else Reflect.deleteProperty(indexedDB, 'open');
      }
    }, { docId: id, failure });
    expect(result).toEqual({ content: 'Verified server content', status: 'connected', cacheStatus: 'error', malformedKeyUnchanged: true });
  });
}

for (const failure of ['malformed-key', 'write-quota'] as const) {
  test(`editor reports ${failure} cache failure while server edits remain available`, async ({ page }) => {
    const { id } = await createUserDocument(page, 'Editor cache failure');
    await page.goto(`/n/${id}`);
    await ensureReady(page);
    const editor = page.locator('.editor-input');
    await editor.click();
    await page.keyboard.type('Server content survives');
    await waitForSynced(page);
    if (failure === 'malformed-key') {
      await page.evaluate(async () => {
        const { userId } = await (await fetch('/api/current-user')).json() as { userId: string };
        localStorage.setItem(`remdo-encrypted-v1-key:${encodeURIComponent(userId)}`, '{invalid');
      });
      await page.reload();
      await ensureReady(page);
    } else {
      await page.evaluate(() => {
        const transaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
          if (this.name.startsWith('remdo-encrypted-v1-') && args[1] === 'readwrite') {
            throw new DOMException('Offline storage full', 'QuotaExceededError');
          }
          return transaction.apply(this, args);
        };
      });
    }
    await expect(editor).toContainText('Server content survives');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' and remains editable');
    await waitForSynced(page);
    await expect(editor).toContainText('Server content survives and remains editable');
    await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Saved to server.*Local persistence error.*Server connected/u);
    await expect(page.getByText('Offline copy unavailable', { exact: true })).toBeVisible();
  });
}

test('notifies peers of a committed update even when cache compaction aborts', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const fixturePath = '/tests/e2e/_support/local-persistence-browser.ts';
    const { createLocalPersistence, Doc } = await import(fixturePath);
    const accountId = crypto.randomUUID();
    const writer = new Doc();
    let failed = false;
    const writerCache = createLocalPersistence('abort-review', writer, { accountId, onError: () => { failed = true; } });
    await writerCache.whenSynced;
    // 1 initial snapshot + 61 updates + peer's snapshot = 63 records.
    for (let index = 0; index < 61; index += 1) {
      writer.getMap('content').set('version', index);
      await writerCache.flush();
    }
    const peer = new Doc();
    const peerCache = createLocalPersistence('abort-review', peer, { accountId });
    await peerCache.whenSynced;
    const name = (await indexedDB.databases()).find(({ name }) => name?.includes(accountId))!.name!;
    const clear = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.clear = function () {
      const result = clear.call(this);
      if (this.transaction.db.name === name) {
        const transaction = this.transaction;
        queueMicrotask(() => transaction.abort());
      }
      return result;
    };
    const refreshed = new Promise<void>((resolve) => {
      const onUpdate = () => {
        if (peer.getMap('content').get('version') === 999) {
          peer.off('update', onUpdate);
          resolve();
        }
      };
      peer.on('update', onUpdate);
    });
    writer.getMap('content').set('version', 999);
    const flushFailed = await writerCache.flush().then(() => false, () => true);
    IDBObjectStore.prototype.clear = clear;
    await refreshed;
    const peerVersion = peer.getMap('content').get('version');
    await writerCache.destroy().catch(() => {});
    await peerCache.destroy();
    return { failed, flushFailed, peerVersion };
  });
  expect(result).toEqual({ failed: true, flushFailed: true, peerVersion: 999 });
});
