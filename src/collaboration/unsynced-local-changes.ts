/**
 * Origin-wide unsynced documents. Y-Sweet's IndexedDB cache has no ack
 * watermark, so logout cannot inspect it. Each document is its own storage
 * key so two tabs cannot clobber each other's marks. A session that dies
 * still dirty leaves its key; only an ack or logout removes it.
 */
const KEY_PREFIX = 'remdo-unsynced:';

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function unsyncedKey(docId: string): string {
  return `${KEY_PREFIX}${docId}`;
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
  return storage !== null && unsyncedKeys(storage).length > 0;
}
