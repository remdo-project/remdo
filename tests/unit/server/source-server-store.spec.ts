import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServerDatabaseClient } from '#server/db/client';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { deriveSourceId } from '#server/remdo-oauth/config';
import {
  claimSourceServerPublicClient,
  ensureSourceServerRow,
  listSourceServers,
  readSourceServersSync,
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

  it('creates a source row derived from its URL, with no credentials yet', async () => {
    const added = await ensureSourceServerRow(database, 'https://source.example');
    expect(added).toEqual({
      id: SOURCE_ID,
      label: 'source.example',
      baseUrl: 'https://source.example',
      credentials: null,
    });
    expect(await listSourceServers(database)).toEqual([added]);
  });

  it('is idempotent (a repeat call returns the row, no duplicate-row throw)', async () => {
    const first = await ensureSourceServerRow(database, 'https://source.example');
    const second = await ensureSourceServerRow(database, 'https://source.example');
    expect(second.id).toBe(first.id);
    expect(await listSourceServers(database)).toHaveLength(1);
  });

  it('rejects a non-origin URL', async () => {
    await expect(ensureSourceServerRow(database, 'https://source.example/path'))
      .rejects.toThrow('bare http(s) origin');
  });

  it('records registered credentials so the source becomes usable', async () => {
    await ensureSourceServerRow(database, 'https://source.example');
    await claimSourceServerPublicClient(database, SOURCE_ID, 'cid');

    const [stored] = await listSourceServers(database);
    expect(stored!.credentials).toEqual({ clientId: 'cid' });
  });

  it('claims a public client first-writer-wins (a later claim keeps the first id)', async () => {
    await ensureSourceServerRow(database, 'https://source.example');
    await claimSourceServerPublicClient(database, SOURCE_ID, 'first');
    await claimSourceServerPublicClient(database, SOURCE_ID, 'second');
    const [stored] = await listSourceServers(database);
    expect(stored!.credentials).toEqual({ clientId: 'first' });
  });

  it('reads sources synchronously for auth construction', async () => {
    await ensureSourceServerRow(database, 'https://source.example');
    await claimSourceServerPublicClient(database, SOURCE_ID, 'cid');

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
    await ensureSourceServerRow(database, 'https://source.example');
    await claimSourceServerPublicClient(database, SOURCE_ID, 'public-client-id');

    const [server] = await listSourceServers(database);
    expect(server!.credentials).toEqual({ clientId: 'public-client-id' });
  });
});
