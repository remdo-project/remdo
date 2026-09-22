import { LOCAL_PERSISTENCE_PREFIX, revokeLocalPersistenceKeys } from '#collaboration/local-persistence';

function deleteIndexedDbDatabase(indexedDb: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.deleteDatabase(name);
    request.addEventListener('success', () => resolve());
    request.addEventListener('error', () => reject(request.error ?? new Error('Failed to delete offline cache.')));
    request.addEventListener('blocked', () => reject(new Error('Offline cache deletion was blocked by an open connection.')));
  });
}

export async function clearLocalUserData(): Promise<void> {
  // Calling this removes keys synchronously, before any database operations.
  const revoked = revokeLocalPersistenceKeys();
  const deleted = (async () => {
    await revoked.catch(() => {});
    const indexedDb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!indexedDb) return;
    const databases = await indexedDb.databases();
    await Promise.all(databases.flatMap(({ name }) =>
      name?.startsWith(LOCAL_PERSISTENCE_PREFIX) ? [deleteIndexedDbDatabase(indexedDb, name)] : []));
  })();
  const results = await Promise.allSettled([revoked, deleted]);
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Failed to clear all local user data.');
  }
}
