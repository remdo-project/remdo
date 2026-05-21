const YSWEET_INDEXED_DB_PREFIX = 'y-sweet-';
const YSWEET_OFFLINE_KEY_COOKIE = 'YSWEET_OFFLINE_KEY';
const PENDING_LOCAL_USER_DATA_CLEANUP_KEY = 'remdo-pending-local-user-data-cleanup';

interface CookieStoreLike {
  delete: (name: string) => Promise<void>;
}

function getIndexedDb(): IDBFactory | undefined {
  return (globalThis as { indexedDB?: IDBFactory }).indexedDB;
}

function getCleanupStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function markLocalUserDataCleanupPending(): void {
  getCleanupStorage()?.setItem(PENDING_LOCAL_USER_DATA_CLEANUP_KEY, '1');
}

export async function retryPendingLocalUserDataCleanup(): Promise<void> {
  const storage = getCleanupStorage();
  if (storage?.getItem(PENDING_LOCAL_USER_DATA_CLEANUP_KEY) !== '1') {
    return;
  }

  await clearLocalUserData();
  storage.removeItem(PENDING_LOCAL_USER_DATA_CLEANUP_KEY);
}

async function deleteCookie(name: string): Promise<void> {
  const cookieStore = (globalThis as { cookieStore?: CookieStoreLike }).cookieStore;
  if (cookieStore) {
    await cookieStore.delete(name);
    return;
  }

  const expired = `${name}=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  // eslint-disable-next-line unicorn/no-document-cookie -- Y-Sweet stores its offline key in a cookie.
  document.cookie = expired;
  // eslint-disable-next-line unicorn/no-document-cookie -- Clear cookies written with Y-Sweet's secure attribute too.
  document.cookie = `${expired};secure`;
}

function deleteIndexedDbDatabase(name: string): Promise<void> {
  const indexedDb = getIndexedDb();
  if (!indexedDb) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const request = indexedDb.deleteDatabase(name);
    request.addEventListener('success', () => resolve());
    request.addEventListener('error', () => reject(request.error ?? new Error(`Failed to delete IndexedDB ${name}.`)));
    request.addEventListener('blocked', () => reject(new Error(`IndexedDB ${name} delete was blocked by an open connection.`)));
  });
}

async function deleteYSweetIndexedDbs(): Promise<void> {
  const indexedDb = getIndexedDb();
  if (!indexedDb || typeof indexedDb.databases !== 'function') {
    return;
  }

  const databases = await indexedDb.databases();
  await Promise.all(
    databases
      .map((database) => database.name)
      .filter((name): name is string => typeof name === 'string' && name.startsWith(YSWEET_INDEXED_DB_PREFIX))
      .map(deleteIndexedDbDatabase),
  );
}

export async function clearLocalUserData(): Promise<void> {
  await deleteCookie(YSWEET_OFFLINE_KEY_COOKIE);
  await deleteYSweetIndexedDbs();
}
