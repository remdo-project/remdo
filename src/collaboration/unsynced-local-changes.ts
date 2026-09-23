/**
 * Origin-wide unsynced documents. The encrypted IndexedDB cache has no ack
 * watermark, so logout cannot inspect it. Each (document, tab) pair is its own
 * storage key so one tab's ack cannot drop another tab's mark. A session that
 * dies still dirty leaves its key; only that tab's ack or logout removes it.
 */
const KEY_PREFIX = 'remdo-unsynced:';
const TAB_STORAGE_KEY = 'remdo-unsynced-tab-id';

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function tabId(): string {
  const storage = getSessionStorage();
  if (!storage) {
    return 'local';
  }
  let id = storage.getItem(TAB_STORAGE_KEY);
  if (!id) {
    const randomUUID = globalThis.crypto.randomUUID;
    id = typeof randomUUID === 'function'
      ? randomUUID.call(globalThis.crypto)
      : `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
    storage.setItem(TAB_STORAGE_KEY, id);
  }
  return id;
}

function unsyncedKey(docId: string): string {
  return `${KEY_PREFIX}${docId}:${tabId()}`;
}

function unsyncedKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(KEY_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
}

export function markDocumentUnsynced(docId: string): void {
  getLocalStorage()?.setItem(unsyncedKey(docId), '1');
}

// Any tab's mark counts: tabs share the cache, so one tab can hydrate another's
// unacknowledged edits.
export function isDocumentUnsynced(docId: string): boolean {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }
  const documentPrefix = `${KEY_PREFIX}${docId}:`;
  return unsyncedKeys(storage).some(key => key.startsWith(documentPrefix));
}

export function markDocumentSynced(docId: string): void {
  getLocalStorage()?.removeItem(unsyncedKey(docId));
}

export function clearUnsyncedLocalChanges(): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  for (const key of unsyncedKeys(storage)) {
    storage.removeItem(key);
  }
}

export function hasUnsyncedLocalChanges(): boolean {
  const storage = getLocalStorage();
  return !!storage && unsyncedKeys(storage).length > 0;
}
