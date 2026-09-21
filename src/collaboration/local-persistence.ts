import * as Y from 'yjs';

export const LOCAL_CACHE_ORIGIN = Symbol('RemDo encrypted local cache');
export const LOCAL_PERSISTENCE_PREFIX = 'remdo-encrypted-v1-';
export const LOCAL_PERSISTENCE_KEY_PREFIX = `${LOCAL_PERSISTENCE_PREFIX}key:`;
const active = new Set<() => Promise<void>>();
const CHECKPOINT_INTERVAL = 64;

interface StoredUpdate {
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
}
interface CacheKey {
  generation: string;
  key: JsonWebKey;
}

export interface LocalPersistence {
  whenSynced: Promise<void>;
  flush: () => Promise<void>;
  destroy: () => Promise<void>;
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Offline cache transaction aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Offline cache transaction failed.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Offline cache request failed.'));
  });
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore('updates', { autoIncrement: true });
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Offline cache open blocked.'));
    };
    request.onerror = () => reject(request.error ?? new Error('Offline cache open failed.'));
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}

/** Removes key material before yielding, including when database deletion is blocked. */
export function revokeLocalPersistenceKeys(): Promise<void> {
  let failure: unknown;
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) {
      if (key?.startsWith(LOCAL_PERSISTENCE_KEY_PREFIX)) localStorage.removeItem(key);
    }
  } catch (error) {
    failure = error;
  }
  const closing = [...active].map((revoke) => revoke());
  return Promise.all(closing).then(() => {
    if (failure) throw failure;
  });
}

export function createLocalPersistence(
  docId: string,
  doc: Y.Doc,
  options: { accountId: string; onError?: (error: unknown) => void; onRevoked?: () => void },
): LocalPersistence {
  const keyName = `${LOCAL_PERSISTENCE_KEY_PREFIX}${encodeURIComponent(options.accountId)}`;
  const origin = LOCAL_CACHE_ORIGIN;
  let stopped = false;
  const isStopped = () => stopped;
  let db: IDBDatabase | undefined;
  let channel: BroadcastChannel | undefined;
  let key: CryptoKey;
  let serializedKey: string;
  let databaseName: string;
  let failure: unknown;
  let queue: Promise<void> = Promise.resolve();
  let closing: Promise<void> | undefined;

  const enqueue = (operation: () => Promise<void>) => {
    queue = queue.then(operation).catch(report);
  };
  const current = () => !stopped && localStorage.getItem(keyName) === serializedKey;
  const encrypt = async (update: Uint8Array): Promise<StoredUpdate> => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(databaseName) }, key, new Uint8Array(update),
    );
    return { iv, ciphertext };
  };
  const decrypt = async (record: StoredUpdate) => new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv, additionalData: new TextEncoder().encode(databaseName) }, key, record.ciphertext,
  ));
  const read = async (): Promise<StoredUpdate[]> => {
    const transaction = db!.transaction('updates', 'readonly');
    return requestResult(transaction.objectStore('updates').getAll()) as Promise<StoredUpdate[]>;
  };
  const refresh = async () => {
    if (!current()) return;
    const cached = new Y.Doc();
    try {
      // Authenticate and validate the entire batch before changing the live doc.
      // A damaged later record must not leak an earlier partial cache to peers.
      for (const record of await read()) Y.applyUpdate(cached, await decrypt(record));
      if (current()) Y.applyUpdate(doc, Y.encodeStateAsUpdate(cached), origin);
    } finally {
      cached.destroy();
    }
  };
  const write = async (update: Uint8Array) => {
    // Append and checkpoint share a cross-tab lock. Encryption must finish before
    // starting the IDB transaction, which otherwise auto-commits during the await.
    await navigator.locks.request(databaseName, async () => {
      if (!current()) return;
      const record = await encrypt(update);
      if (!current()) return;
      const transaction = db!.transaction('updates', 'readwrite');
      const done = completed(transaction);
      transaction.objectStore('updates').add(record);
      await done;
      // Compaction can fail independently of the committed append. Peers must
      // still receive that durable update when the optional checkpoint aborts.
      channel?.postMessage('updated');
      const records = await read();
      if (records.length >= CHECKPOINT_INTERVAL) {
        const checkpoint = new Y.Doc();
        try {
          for (const item of records) Y.applyUpdate(checkpoint, await decrypt(item));
          const snapshot = await encrypt(Y.encodeStateAsUpdate(checkpoint));
          if (!current()) return;
          const compact = db!.transaction('updates', 'readwrite');
          const compacted = completed(compact);
          compact.objectStore('updates').clear();
          compact.objectStore('updates').add(snapshot);
          await compacted;
        } finally {
          checkpoint.destroy();
        }
      }
    });
  };
  const onUpdate = (update: Uint8Array, updateOrigin: unknown) => {
    if (!stopped && updateOrigin !== origin) enqueue(() => write(update));
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || (event.key === keyName && (event.newValue === null || (serializedKey && !current())))) {
      void revoke().catch(report);
    }
  };
  const destroy = (): Promise<void> => {
    if (closing) return closing;
    // Detach immediately, but allow already queued writes to drain on ordinary
    // teardown. Revocation sets stopped first so those writes cannot resurrect data.
    doc.off('update', onUpdate);
    if (channel) channel.onmessage = null;
    // Logout must still revoke initialization that is generating its first key.
    closing = queue.finally(() => {
      stopped = true;
      window.removeEventListener('storage', onStorage);
      active.delete(revoke);
      channel?.close();
      db?.close();
    }).then(() => { if (failure) throw failure; });
    return closing;
  };
  function report(error: unknown) {
    if (failure) return;
    failure = error;
    stopped = true;
    options.onError?.(error);
    void destroy().catch(() => {});
  }
  function revoke() {
    if (!stopped) {
      stopped = true;
      options.onRevoked?.();
    }
    return destroy();
  }
  const initialize = async () => {
    await navigator.locks.request(keyName, async () => {
      if (isStopped()) return;
      let stored = localStorage.getItem(keyName);
      if (!stored) {
        const generated = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const exported = await crypto.subtle.exportKey('jwk', generated);
        if (isStopped()) return;
        stored = JSON.stringify({ generation: crypto.randomUUID(), key: exported } satisfies CacheKey);
        localStorage.setItem(keyName, stored);
      }
      serializedKey = stored;
      const parsed = JSON.parse(stored) as CacheKey;
      key = await crypto.subtle.importKey('jwk', parsed.key, 'AES-GCM', false, ['encrypt', 'decrypt']);
      databaseName = `${LOCAL_PERSISTENCE_PREFIX}${encodeURIComponent(options.accountId)}:${parsed.generation}:${encodeURIComponent(docId)}`;
    });
    if (!current()) return;
    db = await openDatabase(databaseName);
    db.onversionchange = () => { void revoke().catch(report); };
    if (!current()) return;
    channel = new BroadcastChannel(databaseName);
    channel.onmessage = () => { if (!closing) enqueue(refresh); };
    await refresh();
    // Preserve updates made before the asynchronous cache initialization finished.
    if (current()) await write(Y.encodeStateAsUpdate(doc));
  };
  const persistence: LocalPersistence = {
    whenSynced: Promise.resolve(),
    flush: async () => { await queue; if (failure) throw failure; },
    destroy,
  };
  active.add(revoke);
  window.addEventListener('storage', onStorage);
  doc.on('update', onUpdate);
  persistence.whenSynced = initialize();
  queue = persistence.whenSynced.catch(report);
  return persistence;
}
