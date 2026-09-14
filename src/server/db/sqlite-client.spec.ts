import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getMigrations } from 'better-auth/db/migration';
import { sql } from 'kysely';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerAuth } from '#server/auth/auth';
import { createSqliteServerDatabaseClient } from '#server/db/sqlite-client';
import * as baseline from './migrations/001-baseline';

const historicalSql = fs.readFileSync('tests/fixtures/database/remdo-ba-1.7.0.sql', 'utf8');
const authOptions = {
  allowSignup: true,
  baseURL: 'http://127.0.0.1:4000',
  secret: 'fixture-auth-secret-at-least-32-characters',
};
const directories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function historicalDatabase(transform = (statement: string) => statement): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-migrations-'));
  directories.push(directory);
  const dbPath = path.join(directory, 'remdo.sqlite');
  const sqlite = new Database(dbPath);
  try {
    sqlite.exec(transform(historicalSql));
  } finally {
    sqlite.close();
  }
  return dbPath;
}

function readDataset(sqlite: Database.Database) {
  const tables = sqlite.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'kysely_%' ORDER BY name
  `).all() as { name: string }[];
  return Object.fromEntries(tables.map(({ name }) => [
    name, sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
  ]));
}

describe('versioned SQLite database creation', () => {
  it('creates a complete fresh schema without relying on Better Auth runtime migrations', async () => {
    const client = await createSqliteServerDatabaseClient({ dbPath: ':memory:' });
    try {
      const auth = await createServerAuth({ ...authOptions, database: client });
      const pending = await getMigrations(auth.auth.options);
      expect(pending.toBeCreated).toEqual([]);
      expect(pending.toBeAdded).toEqual([]);
      expect(pending.toBeAddedIndexes).toEqual([]);
      const response = await auth.createUser({
        email: 'fresh@example.test', name: 'Fresh User', password: 'fresh-password-1234',
      }, new Headers());
      expect(response.status).toBe(200);
      expect(client.sqlite.prepare('SELECT name FROM kysely_migration').all())
        .toEqual([{ name: '001-baseline' }]);
    } finally {
      await client.close();
    }
  });

  it.each(['current', 'predecessor-source', 'upgraded-issuer'])('adopts existing data and preserves login and source links: %s', async (variant) => {
    const dbPath = historicalDatabase((statement) => variant === 'upgraded-issuer'
      ? statement.replace(/CREATE TABLE "account"[^;]+;/u, (table) => table
          .replace('"issuer" text not null, ', '')
          .replace(');', ', "issuer" text not null);'))
      : statement);
    const original = new Database(dbPath);
    if (variant === 'predecessor-source') {
      original.exec("ALTER TABLE source_servers ADD COLUMN client_secret TEXT; UPDATE source_servers SET client_secret = 'preserve-obsolete-value';");
    }
    const before = readDataset(original);
    original.close();

    const client = await createSqliteServerDatabaseClient({ dbPath });
    try {
      expect(readDataset(client.sqlite)).toEqual(before);
      const auth = await createServerAuth({ ...authOptions, database: client });
      const response = await auth.auth.handler(new Request('http://127.0.0.1:4000/api/auth/sign-in/email', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'baseline@example.test', password: 'baseline-password-1234' }),
      }));
      expect(response.status).toBe(200);
      const headers = new Headers({ cookie: response.headers.get('set-cookie')! });
      expect(await auth.listLinkedRemdoServerIds(headers)).toEqual(new Set([auth.sourceServers[0]!.id]));
      expect(client.sqlite.prepare('SELECT accessToken, refreshToken FROM account WHERE id = ?')
        .get('historical-source-account')).toEqual({ accessToken: 'historical-access-token', refreshToken: 'historical-refresh-token' });
      await client.db.insertInto('documents').values({
        id: 'new-document', owner_user_id: 'new-owner', document_kind: 'document',
        title: 'New write', created_at: 1, updated_at: 1,
      }).execute();
    } finally {
      await client.close();
    }

    const reopened = await createSqliteServerDatabaseClient({ dbPath });
    try {
      expect(reopened.sqlite.prepare('SELECT name FROM kysely_migration').all())
        .toEqual([{ name: '001-baseline' }]);
      expect(reopened.sqlite.prepare('SELECT title FROM documents WHERE id = ?').get('new-document'))
        .toEqual({ title: 'New write' });
    } finally {
      await reopened.close();
    }
  });

  it.each([
    ['extra table', (s: string) => `${s}\nCREATE TABLE unknown_table (id TEXT);`],
    ['missing index', (s: string) => `${s}\nDROP INDEX account_issuer_accountId_uidx;`],
    ['missing table', (s: string) => `${s}\nDROP TABLE verification;`],
    ['changed constraint', (s: string) => s.replace('"issuer" text not null', '"issuer" text')],
    ['different type token', (s: string) => s.replace('"issuer" text not null', '"issuer" textnotnull')],
    ['extra trigger', (s: string) => `${s}\nCREATE TRIGGER surprise AFTER INSERT ON documents BEGIN DELETE FROM document_access; END;`],
  ])('rejects an unknown schema without adopting or changing data: %s', async (_name, transform) => {
    const dbPath = historicalDatabase(transform);
    const original = new Database(dbPath);
    const before = readDataset(original);
    original.close();
    await expect(createSqliteServerDatabaseClient({ dbPath })).rejects.toThrow('Unsupported');
    const reopened = new Database(dbPath);
    try {
      expect(readDataset(reopened)).toEqual(before);
      expect(reopened.prepare('SELECT * FROM kysely_migration').all()).toEqual([]);
    } finally {
      reopened.close();
    }
  });

  it('rolls back schema, data, and history after a failed migration, then retries', async () => {
    const dbPath = historicalDatabase();
    const close = vi.spyOn(Database.prototype, 'close');
    const actualUp = baseline.up;
    vi.spyOn(baseline, 'up').mockImplementationOnce(async (db) => {
      await actualUp(db);
      await sql`ALTER TABLE documents ADD COLUMN interrupted TEXT`.execute(db);
      await sql`UPDATE documents SET title = 'must roll back'`.execute(db);
      throw new Error('synthetic migration failure');
    });
    await expect(createSqliteServerDatabaseClient({ dbPath })).rejects.toThrow('synthetic migration failure');
    expect(close).toHaveBeenCalledOnce();
    const reopened = new Database(dbPath);
    try {
      expect(reopened.prepare('PRAGMA table_info(documents)').all()).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'interrupted' })]),
      );
      expect(reopened.prepare('SELECT title FROM documents').get()).toEqual({ title: 'Preserved document' });
      expect(reopened.prepare('SELECT * FROM kysely_migration').all()).toEqual([]);
    } finally {
      reopened.close();
    }
    const retried = await createSqliteServerDatabaseClient({ dbPath });
    await retried.close();
  });

  it('fails when recorded migration history belongs to a newer application', async () => {
    const dbPath = historicalDatabase();
    const client = await createSqliteServerDatabaseClient({ dbPath });
    client.sqlite.prepare('INSERT INTO kysely_migration VALUES (?, ?)').run('999-future', '2099-01-01');
    await client.close();
    await expect(createSqliteServerDatabaseClient({ dbPath })).rejects.toThrow('previously executed migration 999-future is missing');
  });
});
