import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServerDatabaseClient } from '#server/db/client';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { deriveSourceId } from '#server/remdo-oauth/config';
import {
  addSourceServer,
  ensureSourceServerRow,
  listSourceServers,
  readSourceServersSync,
  setSourceServerPublicClient,
} from '#server/remdo-oauth/source-server-store';

const SOURCE_ID = deriveSourceId('https://source.example');

describe('source server store', () => {
  let dir: string;
  let database: SqliteServerDatabaseClient;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-source-store-'));
    database = createServerDatabaseClient({ dbPath: path.join(dir, 'remdo.sqlite') });
  });

  afterEach(async () => {
    await database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty', async () => {
    expect(await listSourceServers(database)).toEqual([]);
  });

  it('adds a source derived from its URL, with no credentials yet', async () => {
    const added = await addSourceServer(database, 'https://source.example');
    expect(added).toEqual({
      id: SOURCE_ID,
      label: 'source.example',
      baseUrl: 'https://source.example',
      credentials: null,
    });
    expect(await listSourceServers(database)).toEqual([added]);
  });

  it('rejects a duplicate source', async () => {
    await addSourceServer(database, 'https://source.example');
    await expect(addSourceServer(database, 'https://source.example'))
      .rejects.toThrow('already configured');
  });

  it('ensureSourceServerRow is idempotent (no duplicate-row throw on a repeat call)', async () => {
    // The race-safe get-or-create for the lazy link path: unlike addSourceServer,
    // a second call for the same origin returns the row instead of throwing.
    const first = await ensureSourceServerRow(database, 'https://source.example');
    const second = await ensureSourceServerRow(database, 'https://source.example');
    expect(second.id).toBe(first.id);
    expect(await listSourceServers(database)).toHaveLength(1);
  });

  it('rejects a non-origin URL', async () => {
    await expect(addSourceServer(database, 'https://source.example/path'))
      .rejects.toThrow('bare http(s) origin');
  });

  it('records registered credentials so the source becomes usable', async () => {
    await addSourceServer(database, 'https://source.example');
    await setSourceServerPublicClient(database, SOURCE_ID, 'cid');

    const [stored] = await listSourceServers(database);
    expect(stored!.credentials).toEqual({ clientId: 'cid' });
  });

  it('fails to record credentials for an unknown source', async () => {
    await expect(setSourceServerPublicClient(database, 'missing', 'cid'))
      .rejects.toThrow('not configured');
  });

  it('reads sources synchronously for auth construction', async () => {
    await addSourceServer(database, 'https://source.example');
    await setSourceServerPublicClient(database, SOURCE_ID, 'cid');

    expect(readSourceServersSync(database)).toEqual([
      {
        id: SOURCE_ID,
        label: 'source.example',
        baseUrl: 'https://source.example',
        credentials: { clientId: 'cid' },
      },
    ]);
  });

  it('treats a client_id with no secret as a public-client credential', async () => {
    await addSourceServer(database, 'https://source.example');
    await setSourceServerPublicClient(database, SOURCE_ID, 'public-client-id');

    const [server] = await listSourceServers(database);
    expect(server!.credentials).toEqual({ clientId: 'public-client-id' });
  });
});
