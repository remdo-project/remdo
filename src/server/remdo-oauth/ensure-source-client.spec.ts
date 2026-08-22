import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerDatabaseClient } from '#server/db/client';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { ensureSourceClient } from '#server/remdo-oauth/ensure-source-client';
import { deriveSourceId } from '#server/remdo-oauth/config';
import { ensureSourceServerRow, readSourceServersSync } from '#server/remdo-oauth/source-server-store';

describe('ensureSourceClient', () => {
  let database: SqliteServerDatabaseClient;

  beforeEach(() => {
    database = createServerDatabaseClient({ dbPath: ':memory:' });
  });

  afterEach(async () => {
    await database.close();
  });

  it('registers and caches a public client on first link to a source origin', async () => {
    const registerClient = vi.fn(async () => ({ clientId: 'cid-1' }));
    await ensureSourceClient(
      { database, sourceOrigin: 'https://source.example', homeOrigin: 'https://home.private', scopes: ['remdo'] },
      { registerClient },
    );
    expect(registerClient).toHaveBeenCalledTimes(1);
    const [server] = readSourceServersSync(database);
    expect(server!.credentials).toEqual({ clientId: 'cid-1' });
  });

  it('reuses a credential-less row from a failed prior registration instead of throwing a duplicate error', async () => {
    await ensureSourceServerRow(database, 'https://source.example');
    const registerClient = vi.fn(async () => ({ clientId: 'cid-1' }));
    await ensureSourceClient(
      { database, sourceOrigin: 'https://source.example', homeOrigin: 'https://home.private', scopes: ['remdo'] },
      { registerClient },
    );
    expect(registerClient).toHaveBeenCalledTimes(1);
    const [server] = readSourceServersSync(database);
    expect(server!.credentials).toEqual({ clientId: 'cid-1' });
  });

  it('reuses the cached client on a later link to the same origin (idempotent)', async () => {
    const registerClient = vi.fn(async () => ({ clientId: 'cid-1' }));
    await ensureSourceClient(
      { database, sourceOrigin: 'https://source.example', homeOrigin: 'https://home.private', scopes: [] },
      { registerClient },
    );
    const second = await ensureSourceClient(
      { database, sourceOrigin: 'https://source.example', homeOrigin: 'https://home.private', scopes: [] },
      { registerClient },
    );
    // The second link reuses the cached client: no re-registration, same source.
    expect(registerClient).toHaveBeenCalledTimes(1);
    const [server] = readSourceServersSync(database);
    expect(second.sourceId).toBe(server!.id);
  });

  it('re-registers a cached client from the predecessor callback/resource contract', async () => {
    const sourceId = deriveSourceId('https://source.example');
    database.sqlite.exec('CREATE TABLE account (providerId TEXT NOT NULL)');
    database.sqlite
      .prepare('INSERT INTO account (providerId) VALUES (?), (?), (?)')
      .run(sourceId, sourceId, 'other-provider');
    await database.db
      .insertInto('source_servers')
      .values({
        base_url: 'https://source.example',
        client_id: 'legacy-client-id',
        created_at: Date.now(),
      })
      .execute();
    const registerClient = vi.fn(async () => ({ clientId: 'current-client-id' }));

    await ensureSourceClient(
      { database, sourceOrigin: 'https://source.example', homeOrigin: 'https://home.private', scopes: ['remdo'] },
      { registerClient },
    );
    await ensureSourceClient(
      { database, sourceOrigin: 'https://source.example', homeOrigin: 'https://home.private', scopes: ['remdo'] },
      { registerClient },
    );

    expect(registerClient).toHaveBeenCalledTimes(1);
    const [server] = readSourceServersSync(database);
    expect(server!.credentials).toEqual({ clientId: 'current-client-id' });
    expect(database.sqlite.prepare('SELECT providerId FROM account ORDER BY providerId').all())
      .toEqual([{ providerId: 'other-provider' }]);
  });
});
