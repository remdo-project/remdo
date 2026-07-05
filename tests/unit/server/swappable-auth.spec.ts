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
  setSourceServerPublicClient,
} from '#server/remdo-oauth/source-server-store';

const SOURCE_ID = deriveSourceId('https://source.example');

// The genericOAuth provider ids currently live on the auth instance. A source is
// linkable only once its provider is registered here — the sourceServers array
// flipping is not sufficient, so assert against the actual provider config.
function liveProviderIds(swappable: ReturnType<typeof createSwappableServerAuth>): string[] {
  const options = swappable.auth.auth.options as { plugins?: { id?: string; options?: { config?: { providerId: string }[] } }[] };
  const genericOAuth = options.plugins?.find((plugin) => plugin.id === 'generic-oauth');
  return (genericOAuth?.options?.config ?? []).map((entry) => entry.providerId);
}

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

  it('rebuild() makes a source registered after construction a live provider', async () => {
    const swappable = build();
    expect(swappable.auth.sourceServers).toEqual([]);
    expect(liveProviderIds(swappable)).toEqual([]);

    await addSourceServer(database, 'https://source.example');
    await setSourceServerPublicClient(database, SOURCE_ID, 'cid');
    // Not visible until rebuild.
    expect(swappable.auth.sourceServers).toEqual([]);
    expect(liveProviderIds(swappable)).toEqual([]);

    swappable.rebuild();
    expect(swappable.auth.sourceServers).toHaveLength(1);
    expect(swappable.auth.sourceServers[0]).toMatchObject({
      id: SOURCE_ID,
      credentials: { clientId: 'cid', clientSecret: null },
    });
    // The rebuilt Better Auth instance actually carries the OAuth provider — this
    // is what makes the source linkable, not just the array entry.
    expect(liveProviderIds(swappable)).toEqual([SOURCE_ID]);
  });

  it('an added-but-unregistered source has no provider', async () => {
    // Adding a source inserts a credential-less row: no OAuth provider exists for
    // it (nothing to link against) until registration persists its credentials.
    await addSourceServer(database, 'https://source.example');
    const swappable = build();
    expect(swappable.auth.sourceServers).toHaveLength(1);
    expect(swappable.auth.sourceServers[0]?.credentials).toBeNull();
    expect(liveProviderIds(swappable)).toEqual([]);
  });
});
