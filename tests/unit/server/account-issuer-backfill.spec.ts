import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerAuth } from '#server/auth/auth';
import { createServerDatabaseClient } from '#server/db/client';

const betterAuthMock = vi.hoisted(() => vi.fn());
const getMigrationsMock = vi.hoisted(() => vi.fn());

vi.mock('better-auth', () => ({ betterAuth: betterAuthMock }));

vi.mock('better-auth/db/migration', () => ({ getMigrations: getMigrationsMock }));

vi.mock('@better-auth/oauth-provider', () => ({
  oauthProvider: () => ({ id: 'oauth-provider' }),
  oauthProviderAuthServerMetadata: () => async () => new Response(),
  oauthProviderOpenIdConfigMetadata: () => async () => new Response(),
}));

function fakeBetterAuth() {
  return {
    $context: Promise.resolve({}),
    api: {},
    handler: vi.fn(),
    options: {},
  };
}

/** The `account` shape Better Auth created before it required an issuer. */
function createPreIssuerAccountTable(sqlite: ReturnType<typeof createServerDatabaseClient>['sqlite']) {
  sqlite.exec(`
    CREATE TABLE account (
      id TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      userId TEXT NOT NULL,
      password TEXT
    );
  `);
}

function readIssuers(sqlite: ReturnType<typeof createServerDatabaseClient>['sqlite']) {
  return sqlite
    .prepare('SELECT providerId, issuer FROM account ORDER BY id')
    .all() as { providerId: string; issuer: string }[];
}

async function readyAuthFor(
  database: ReturnType<typeof createServerDatabaseClient>,
  sourceServers: { baseUrl: string; id: string }[] = []
) {
  const auth = createServerAuth({
    allowSignup: false,
    baseURL: 'http://127.0.0.1:4000',
    database,
    secret: 'test-better-auth-secret-0123456789',
    sourceServers: sourceServers as never,
  });
  await auth.ensureReady();
}

describe('account issuer backfill', () => {
  beforeEach(() => {
    betterAuthMock.mockReset();
    betterAuthMock.mockReturnValue(fakeBetterAuth());
    getMigrationsMock.mockReset();
    getMigrationsMock.mockResolvedValue({ runMigrations: async () => {} });
  });

  it('gives every existing account an issuer in its provider namespace', async () => {
    const database = createServerDatabaseClient({ dbPath: ':memory:' });
    createPreIssuerAccountTable(database.sqlite);
    database.sqlite.exec(`
      INSERT INTO account (id, accountId, providerId, userId) VALUES
        ('a1', 'user-1', 'credential', 'user-1'),
        ('a2', 'remote-1', 'unknown-oauth', 'user-1');
    `);

    await readyAuthFor(database);

    // Local authentication and OAuth identities occupy distinct namespaces, so
    // a provider id cannot collide across the two.
    expect(readIssuers(database.sqlite)).toEqual([
      { providerId: 'credential', issuer: 'local:credential' },
      { providerId: 'unknown-oauth', issuer: 'local:oauth:unknown-oauth' },
    ]);
    await database.close();
  });

  it('issues a source-linked account against the origin its provider advertises', async () => {
    const database = createServerDatabaseClient({ dbPath: ':memory:' });
    createPreIssuerAccountTable(database.sqlite);
    database.sqlite.exec(
      "INSERT INTO account (id, accountId, providerId, userId) VALUES ('a1', 'remote-1', 'src', 'user-1');"
    );

    await readyAuthFor(database, [{ baseUrl: 'https://source.example', id: 'src' }]);

    // Linking matches on (issuer, accountId), so any other value would orphan
    // the account the next time its owner signs in through the source.
    expect(readIssuers(database.sqlite)).toEqual([
      { providerId: 'src', issuer: 'https://source.example' },
    ]);
    await database.close();
  });

  it('adds the column that Better Auth cannot add to a populated table', async () => {
    const database = createServerDatabaseClient({ dbPath: ':memory:' });
    createPreIssuerAccountTable(database.sqlite);
    database.sqlite.exec(
      "INSERT INTO account (id, accountId, providerId, userId) VALUES ('a1', 'user-1', 'credential', 'user-1');"
    );

    // Better Auth emits `add column issuer text not null` with no default, which
    // SQLite rejects once rows exist.
    expect(() => database.sqlite.exec('ALTER TABLE account ADD COLUMN probe TEXT NOT NULL'))
      .toThrow(/NOT NULL/iu);

    await readyAuthFor(database);

    const columns = database.sqlite.prepare('PRAGMA table_info(account)').all() as { name: string }[];
    expect(columns.map((column) => column.name)).toContain('issuer');
    await database.close();
  });

  it('leaves an already-migrated database untouched', async () => {
    const database = createServerDatabaseClient({ dbPath: ':memory:' });
    createPreIssuerAccountTable(database.sqlite);
    database.sqlite.exec(`
      ALTER TABLE account ADD COLUMN issuer TEXT NOT NULL DEFAULT '';
      INSERT INTO account (id, accountId, providerId, userId, issuer)
        VALUES ('a1', 'user-1', 'credential', 'user-1', 'https://issuer.example');
    `);

    await readyAuthFor(database);

    expect(readIssuers(database.sqlite)).toEqual([
      { providerId: 'credential', issuer: 'https://issuer.example' },
    ]);
    await database.close();
  });

  it('starts a database that has no account table yet', async () => {
    const database = createServerDatabaseClient({ dbPath: ':memory:' });

    await expect(readyAuthFor(database)).resolves.toBeUndefined();
    await database.close();
  });

  it('refuses a database whose accounts would collide once scoped by issuer', async () => {
    const database = createServerDatabaseClient({ dbPath: ':memory:' });
    createPreIssuerAccountTable(database.sqlite);
    // Two rows for one provider identity resolve to the same (issuer, accountId)
    // and would fail inside Better Auth's unique index instead.
    database.sqlite.exec(`
      INSERT INTO account (id, accountId, providerId, userId) VALUES
        ('a1', 'shared', 'credential', 'user-1'),
        ('a2', 'shared', 'credential', 'user-2');
    `);

    await expect(readyAuthFor(database)).rejects.toThrow(/sharing an identity/iu);

    // The refusal leaves the table as it was, so the operator can reconcile it.
    const columns = database.sqlite.prepare('PRAGMA table_info(account)').all() as { name: string }[];
    expect(columns.map((column) => column.name)).not.toContain('issuer');
    await database.close();
  });

  it('leaves issuer required without a default, as a fresh database declares it', async () => {
    const database = createServerDatabaseClient({ dbPath: ':memory:' });
    createPreIssuerAccountTable(database.sqlite);
    database.sqlite.exec(
      "INSERT INTO account (id, accountId, providerId, userId) VALUES ('a1', 'user-1', 'credential', 'user-1');"
    );

    await readyAuthFor(database);

    const { sql } = database.sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'account'")
      .get() as { sql: string };
    expect(sql).toMatch(/"issuer" text not null/iu);
    expect(sql).not.toMatch(/issuer[^,)]*default/iu);
    expect(readIssuers(database.sqlite)).toEqual([
      { providerId: 'credential', issuer: 'local:credential' },
    ]);
    await database.close();
  });
});
