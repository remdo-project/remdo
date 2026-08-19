/**
 * Origin-wide unsynced documents. Y-Sweet's IndexedDB cache has no ack
 * watermark, so logout cannot inspect it. This flag is written when a provider
 * reports local changes and left in place if that session dies still dirty.
 */
const STORAGE_KEY = 'remdo-unsynced-documents';

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readDocIds(): Set<string> {
  const raw = getLocalStorage()?.getItem(STORAGE_KEY);
  if (!raw) {
    return new Set();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

function writeDocIds(ids: Set<string>): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  if (ids.size === 0) {
    storage.removeItem(STORAGE_KEY);
    return;
  }
  storage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function markDocumentUnsynced(docId: string): void {
  const ids = readDocIds();
  ids.add(docId);
  writeDocIds(ids);
}

export function markDocumentSynced(docId: string): void {
  const ids = readDocIds();
  if (!ids.delete(docId)) {
    return;
  }
  writeDocIds(ids);
}

export function clearUnsyncedLocalChanges(): void {
  writeDocIds(new Set());
}

export function hasUnsyncedLocalChanges(): boolean {
  const raw = getLocalStorage()?.getItem(STORAGE_KEY);
  if (raw === null || raw === undefined) {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.some((id) => typeof id === 'string' && id.length > 0);
  } catch {
    return true;
  }
}
