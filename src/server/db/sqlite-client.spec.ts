import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSqliteServerDatabaseClient } from '#server/db/sqlite-client';

describe('sqlite server database client', () => {
  it('creates the documents table when missing', async () => {
    const client = createSqliteServerDatabaseClient({ dbPath: ':memory:' });
    try {
      const columns = client.sqlite
        .prepare('PRAGMA table_info(documents)')
        .all() as Array<{ name: string }>;

      expect(columns.map((column) => column.name)).toEqual([
        'id',
        'owner_user_id',
        'document_kind',
        'title',
        'created_at',
        'updated_at',
      ]);
    } finally {
      await client.close();
    }
  });

  it('creates the document access table when missing', async () => {
    const client = createSqliteServerDatabaseClient({ dbPath: ':memory:' });
    try {
      const columns = client.sqlite
        .prepare('PRAGMA table_info(document_access)')
        .all() as Array<{ name: string }>;

      expect(columns.map((column) => column.name)).toEqual([
        'document_id',
        'grantee_user_id',
      ]);
    } finally {
      await client.close();
    }
  });

  it('rejects an existing incompatible documents table', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-db-schema-'));
    const dbPath = path.join(tempDir, 'remdo.sqlite');
    const client = createSqliteServerDatabaseClient({ dbPath });
    try {
      client.sqlite.exec(`
        DROP TABLE documents;
        CREATE TABLE documents (
          id TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    } finally {
      await client.close();
    }

    try {
      expect(() => createSqliteServerDatabaseClient({ dbPath })).toThrow(
        'Unsupported documents table schema'
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects legacy extra documents table columns', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-db-schema-'));
    const dbPath = path.join(tempDir, 'remdo.sqlite');
    const client = createSqliteServerDatabaseClient({ dbPath });
    try {
      client.sqlite.exec(`
        DROP TABLE documents;
        CREATE TABLE documents (
          id TEXT PRIMARY KEY,
          owner_user_id TEXT NOT NULL,
          document_kind TEXT NOT NULL,
          title TEXT NOT NULL,
          list_order INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    } finally {
      await client.close();
    }

    try {
      expect(() => createSqliteServerDatabaseClient({ dbPath })).toThrow('Unexpected columns: list_order');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects legacy document access table columns', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-db-schema-'));
    const dbPath = path.join(tempDir, 'remdo.sqlite');
    const client = createSqliteServerDatabaseClient({ dbPath });
    try {
      client.sqlite.exec(`
        DROP TABLE document_access;
        CREATE TABLE document_access (
          document_id TEXT NOT NULL,
          requester_user_id TEXT NOT NULL,
          status TEXT NOT NULL,
          PRIMARY KEY (document_id, requester_user_id)
        );
      `);
    } finally {
      await client.close();
    }

    try {
      expect(() => createSqliteServerDatabaseClient({ dbPath })).toThrow('Unsupported document_access table schema');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects a legacy source servers table (pre id/label drop)', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-db-schema-'));
    const dbPath = path.join(tempDir, 'remdo.sqlite');
    const client = createSqliteServerDatabaseClient({ dbPath });
    try {
      // The old schema stored id + label columns that were dropped; a dev DB from
      // that build must get a clear reset error, not a cryptic insert failure.
      client.sqlite.exec(`
        DROP TABLE source_servers;
        CREATE TABLE source_servers (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          base_url TEXT NOT NULL,
          client_id TEXT,
          client_secret TEXT,
          created_at INTEGER NOT NULL
        );
      `);
    } finally {
      await client.close();
    }

    try {
      expect(() => createSqliteServerDatabaseClient({ dbPath })).toThrow('Unsupported source_servers table schema');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('accepts the immediate predecessor source schema without altering its data', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-db-schema-'));
    const dbPath = path.join(tempDir, 'remdo.sqlite');
    const client = createSqliteServerDatabaseClient({ dbPath });
    try {
      client.sqlite.exec(`
        ALTER TABLE source_servers ADD COLUMN client_secret TEXT;
        INSERT INTO source_servers (base_url, client_id, client_secret, created_at)
        VALUES ('https://source.example', 'public-client-id', 'obsolete-secret', 123);
      `);
    } finally {
      await client.close();
    }

    const reopenedClient = createSqliteServerDatabaseClient({ dbPath });
    try {
      const columns = reopenedClient.sqlite
        .prepare('PRAGMA table_info(source_servers)')
        .all() as Array<{ name: string }>;
      const source = reopenedClient.sqlite
        .prepare('SELECT base_url, client_id, client_secret, created_at FROM source_servers')
        .get();

      expect(columns.map((column) => column.name)).toEqual([
        'base_url',
        'client_id',
        'created_at',
        'client_secret',
      ]);
      expect(source).toEqual({
        base_url: 'https://source.example',
        client_id: 'public-client-id',
        client_secret: 'obsolete-secret',
        created_at: 123,
      });
    } finally {
      await reopenedClient.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates the special-document index for an existing compatible table', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-db-schema-'));
    const dbPath = path.join(tempDir, 'remdo.sqlite');
    const client = createSqliteServerDatabaseClient({ dbPath });
    try {
      client.sqlite.exec('DROP INDEX documents_unique_owner_special_kind;');
    } finally {
      await client.close();
    }

    const reopenedClient = createSqliteServerDatabaseClient({ dbPath });
    try {
      const index = reopenedClient.sqlite
        .prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?')
        .get('index', 'documents_unique_owner_special_kind');

      expect(index).toBeTruthy();
    } finally {
      await reopenedClient.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
