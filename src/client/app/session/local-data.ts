const YSWEET_INDEXED_DB_PREFIX = 'y-sweet-';
const YSWEET_OFFLINE_KEY_COOKIE = 'YSWEET_OFFLINE_KEY';

interface CookieStoreLike {
  delete: (name: string) => Promise<void>;
}

function getIndexedDb(): IDBFactory | undefined {
  return (globalThis as { indexedDB?: IDBFactory }).indexedDB;
}

async function deleteCookie(name: string): Promise<void> {
  const cookieStore = (globalThis as { cookieStore?: CookieStoreLike }).cookieStore;
  if (cookieStore) {
    await cookieStore.delete(name);
    return;
  }

  const expired = `${name}=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  document.cookie = expired;
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
  const results = await Promise.allSettled([
    deleteCookie(YSWEET_OFFLINE_KEY_COOKIE),
    deleteYSweetIndexedDbs(),
  ]);
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    throw new Error('Failed to clear all local user data.');
  }
}
