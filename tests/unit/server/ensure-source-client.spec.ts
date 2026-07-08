import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerDatabaseClient } from '#server/db/client';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { ensureSourceClient } from '#server/remdo-oauth/ensure-source-client';
import { ensureSourceServerRow, listSourceServers } from '#server/remdo-oauth/source-server-store';

describe('ensureSourceClient', () => {
  let dir: string;
  let database: SqliteServerDatabaseClient;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-ensure-source-client-'));
    database = createServerDatabaseClient({ dbPath: path.join(dir, 'remdo.sqlite') });
  });

  afterEach(async () => {
    await database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('registers and caches a public client on first link to a source origin', async () => {
    const registerClient = vi.fn(async () => ({ clientId: 'cid-1' }));
    await ensureSourceClient(
      { database, sourceOrigin: 'https://source.example', homeOrigin: 'https://home.private', scopes: ['remdo'] },
      { registerClient },
    );
    expect(registerClient).toHaveBeenCalledTimes(1);
    const [server] = await listSourceServers(database);
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
    const [server] = await listSourceServers(database);
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
    const [server] = await listSourceServers(database);
    expect(second.sourceId).toBe(server!.id);
  });
});
