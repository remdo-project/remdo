import { getMigrations } from 'better-auth/db/migration';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSwappableServerAuth } from '#server/auth/auth';
import { createServerDatabaseClient } from '#server/db/client';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { deriveSourceId } from '#server/remdo-oauth/config';
import {
  ensureSourceServerRow,
  claimSourceServerPublicClient,
} from '#server/remdo-oauth/source-server-store';

const SOURCE_ID = deriveSourceId('https://source.example');
const OTHER_SOURCE_ID = deriveSourceId('https://other.example');

vi.mock('better-auth/db/migration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth/db/migration')>();
  return {
    ...actual,
    getMigrations: vi.fn(actual.getMigrations),
  };
});

// The genericOAuth provider ids currently live on the auth instance. A source is
// linkable only once its provider is registered here — the sourceServers array
// flipping is not sufficient, so assert against the actual provider config.
function liveProviderIds(swappable: ReturnType<typeof createSwappableServerAuth>): string[] {
  const options = swappable.auth.auth.options as { plugins?: { id?: string; options?: { config?: { providerId: string }[] } }[] };
  const genericOAuth = options.plugins?.find((plugin) => plugin.id === 'generic-oauth');
  return (genericOAuth?.options?.config ?? []).map((entry) => entry.providerId);
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

// The swappable auth is what makes a self-registered source linkable without a
// restart: rebuild() must re-read the DB source list so a newly cached client_id
// becomes a live OAuth provider.
describe('createSwappableServerAuth', () => {
  let database: SqliteServerDatabaseClient;
  let swappable: ReturnType<typeof createSwappableServerAuth> | undefined;

  beforeEach(() => {
    database = createServerDatabaseClient({ dbPath: ':memory:' });
  });

  afterEach(async () => {
    await swappable?.auth.ensureReady();
    await database.close();
  });

  function build() {
    swappable = createSwappableServerAuth({
      allowSignup: false,
      baseURL: 'http://127.0.0.1:4000',
      database,
      secret: 'test-better-auth-secret-0123456789',
    });
    return swappable;
  }

  it('rebuild() makes a source registered after construction a live provider', async () => {
    const swappable = build();
    expect(swappable.auth.sourceServers).toEqual([]);
    expect(liveProviderIds(swappable)).toEqual([]);

    await ensureSourceServerRow(database, 'https://source.example');
    await claimSourceServerPublicClient(database, 'https://source.example', 'cid');
    // Not visible until rebuild.
    expect(swappable.auth.sourceServers).toEqual([]);
    expect(liveProviderIds(swappable)).toEqual([]);

    await swappable.rebuild();
    expect(swappable.auth.sourceServers).toHaveLength(1);
    expect(swappable.auth.sourceServers[0]).toMatchObject({
      id: SOURCE_ID,
      credentials: { clientId: 'cid' },
    });
    // The rebuilt Better Auth instance actually carries the OAuth provider — this
    // is what makes the source linkable, not just the array entry.
    expect(liveProviderIds(swappable)).toEqual([SOURCE_ID]);
  });

  it('serializes overlapping rebuilds so an older snapshot cannot publish last', async () => {
    const swappable = build();
    await swappable.auth.ensureReady();
    await ensureSourceServerRow(database, 'https://source.example');
    await claimSourceServerPublicClient(database, 'https://source.example', 'cid');

    const actualGetMigrations = vi.mocked(getMigrations).getMockImplementation()!;
    const firstReplacementStarted = createDeferred();
    const releaseFirstReplacement = createDeferred();
    vi.mocked(getMigrations).mockImplementationOnce(async (...args) => {
      const migrations = await actualGetMigrations(...args);
      return {
        ...migrations,
        async runMigrations() {
          firstReplacementStarted.resolve();
          await releaseFirstReplacement.promise;
          await migrations.runMigrations();
        },
      };
    });

    const firstRebuild = swappable.rebuild();
    await firstReplacementStarted.promise;
    await ensureSourceServerRow(database, 'https://other.example');
    await claimSourceServerPublicClient(database, 'https://other.example', 'other-cid');

    const migrationCallsBeforeSecond = vi.mocked(getMigrations).mock.calls.length;
    const secondRebuild = swappable.rebuild();
    let idle = false;
    const waitForIdle = swappable.waitForIdle().then(() => {
      idle = true;
    });
    await expect(swappable.rebuild()).rejects.toThrow('Auth is shutting down.');
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(vi.mocked(getMigrations)).toHaveBeenCalledTimes(migrationCallsBeforeSecond);
    expect(idle).toBe(false);

    releaseFirstReplacement.resolve();
    await Promise.all([firstRebuild, secondRebuild, waitForIdle]);
    expect(idle).toBe(true);
    expect(liveProviderIds(swappable)).toEqual(expect.arrayContaining([
      SOURCE_ID,
      OTHER_SOURCE_ID,
    ]));
    expect(liveProviderIds(swappable)).toHaveLength(2);
  });

  it('allows a later rebuild to recover after replacement initialization fails', async () => {
    const swappable = build();
    await swappable.auth.ensureReady();
    await ensureSourceServerRow(database, 'https://source.example');
    await claimSourceServerPublicClient(database, 'https://source.example', 'cid');

    const actualGetMigrations = vi.mocked(getMigrations).getMockImplementation()!;
    vi.mocked(getMigrations).mockImplementationOnce(async (...args) => {
      const migrations = await actualGetMigrations(...args);
      return {
        ...migrations,
        async runMigrations() {
          throw new Error('replacement initialization failed');
        },
      };
    });

    await expect(swappable.rebuild()).rejects.toThrow('replacement initialization failed');
    await expect(swappable.rebuild()).resolves.toBeUndefined();
    expect(liveProviderIds(swappable)).toEqual([SOURCE_ID]);
  });

  it('a source row without a cached client has no provider', async () => {
    // The first link creates a credential-less row; no OAuth provider exists for
    // it (nothing to link against) until self-registration persists a client_id.
    await ensureSourceServerRow(database, 'https://source.example');
    const swappable = build();
    expect(swappable.auth.sourceServers).toHaveLength(1);
    expect(swappable.auth.sourceServers[0]?.credentials).toBeNull();
    expect(liveProviderIds(swappable)).toEqual([]);
  });
});
