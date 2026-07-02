import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSwappableServerAuth } from '#server/auth/auth';
import { createServerDatabaseClient } from '#server/db/client';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { deriveSourceId } from '#server/remdo-oauth/config';
import {
  addSourceServer,
  removeSourceServer,
  setSourceServerCredentials,
} from '#server/remdo-oauth/source-server-store';

const SOURCE_ID = deriveSourceId('https://source.example');

// The swappable auth is what makes a registered source linkable, and a removed
// source unusable, without a restart: rebuild() must re-read the DB source list.
describe('createSwappableServerAuth', () => {
  let dir: string;
  let database: SqliteServerDatabaseClient;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-swappable-auth-'));
    database = createServerDatabaseClient({ dbPath: path.join(dir, 'remdo.sqlite') });
  });

  afterEach(async () => {
    await database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function build() {
    return createSwappableServerAuth({
      allowSignup: false,
      baseURL: 'http://127.0.0.1:4000',
      database,
      secret: 'test-better-auth-secret-0123456789',
    });
  }

  it('rebuild() reflects a source registered after construction', async () => {
    const swappable = build();
    expect(swappable.auth.sourceServers).toEqual([]);

    await addSourceServer(database, 'https://source.example');
    await setSourceServerCredentials(database, SOURCE_ID, { clientId: 'cid', clientSecret: 'sec' });
    // Not visible until rebuild.
    expect(swappable.auth.sourceServers).toEqual([]);

    swappable.rebuild();
    expect(swappable.auth.sourceServers).toHaveLength(1);
    expect(swappable.auth.sourceServers[0]).toMatchObject({
      id: SOURCE_ID,
      credentials: { clientId: 'cid', clientSecret: 'sec' },
    });
  });

  it('rebuild() drops a source removed after construction', async () => {
    await addSourceServer(database, 'https://source.example');
    await setSourceServerCredentials(database, SOURCE_ID, { clientId: 'cid', clientSecret: 'sec' });
    const swappable = build();
    expect(swappable.auth.sourceServers).toHaveLength(1);

    await removeSourceServer(database, SOURCE_ID);
    swappable.rebuild();
    expect(swappable.auth.sourceServers).toEqual([]);
  });
});
