import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServerDatabaseClient } from '@/server/db/client';

describe('server database client', () => {
  it('creates the documents table when missing', () => {
    const client = createServerDatabaseClient({ dbPath: ':memory:' });
    try {
      const columns = client.sqlite
        .prepare('PRAGMA table_info(documents)')
        .all() as Array<{ name: string }>;

      expect(columns.map((column) => column.name)).toEqual([
        'id',
        'owner_user_id',
        'document_kind',
        'title',
        'access_mode',
        'created_at',
        'updated_at',
      ]);
    } finally {
      client.close();
    }
  });

  it('rejects an existing incompatible documents table', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-db-schema-'));
    const dbPath = path.join(tempDir, 'remdo.sqlite');
    const client = createServerDatabaseClient({ dbPath });
    try {
      client.sqlite.exec(`
        DROP TABLE documents;
        CREATE TABLE documents (
          id TEXT PRIMARY KEY,
          access_mode TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    } finally {
      client.close();
    }

    try {
      expect(() => createServerDatabaseClient({ dbPath })).toThrow(
        'Unsupported documents table schema'
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects legacy extra documents table columns', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-db-schema-'));
    const dbPath = path.join(tempDir, 'remdo.sqlite');
    const client = createServerDatabaseClient({ dbPath });
    try {
      client.sqlite.exec(`
        DROP TABLE documents;
        CREATE TABLE documents (
          id TEXT PRIMARY KEY,
          owner_user_id TEXT NOT NULL,
          document_kind TEXT NOT NULL,
          title TEXT NOT NULL,
          list_order INTEGER NOT NULL,
          access_mode TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    } finally {
      client.close();
    }

    try {
      expect(() => createServerDatabaseClient({ dbPath })).toThrow('Unexpected columns: list_order');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates the special-document index for an existing compatible table', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-db-schema-'));
    const dbPath = path.join(tempDir, 'remdo.sqlite');
    const client = createServerDatabaseClient({ dbPath });
    try {
      client.sqlite.exec('DROP INDEX documents_unique_owner_special_kind;');
    } finally {
      client.close();
    }

    const reopenedClient = createServerDatabaseClient({ dbPath });
    try {
      const index = reopenedClient.sqlite
        .prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?')
        .get('index', 'documents_unique_owner_special_kind');

      expect(index).toBeTruthy();
    } finally {
      reopenedClient.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
