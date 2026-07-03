import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { config } from '#config';
import {
  CREATE_DOCUMENT_ACCESS_TABLE_SQL,
  CREATE_DOCUMENTS_TABLE_SQL,
  CREATE_SOURCE_SERVERS_TABLE_SQL,
  DOCUMENTS_TABLE_COLUMNS,
} from './schema';
import type { RemdoDatabase } from './schema';
import type { ServerDatabaseClient } from './types';

const SQLITE_BUSY_TIMEOUT_MS = 5000;

export interface SqliteServerDatabaseClient extends ServerDatabaseClient {
  sqlite: Database.Database;
}

interface SqliteServerDatabaseClientOptions {
  dbPath?: string;
}

function resolveSqliteServerDatabasePath(): string {
  return path.join(config.env.DATA_DIR, 'remdo.sqlite');
}

function shouldCreateParentDirectory(dbPath: string): boolean {
  return dbPath !== ':memory:' && dbPath !== '';
}

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite
    .prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?')
    .get('table', tableName);
  return Boolean(row);
}

function assertDocumentsTableShape(sqlite: Database.Database): void {
  const rows = sqlite
    .prepare('PRAGMA table_info(documents)')
    .all() as Array<{ name: string }>;
  const expectedColumns = new Set<string>(DOCUMENTS_TABLE_COLUMNS);
  const columnNames = new Set(rows.map((row) => row.name));
  const missingColumns = DOCUMENTS_TABLE_COLUMNS.filter((column) => !columnNames.has(column));
  const unexpectedColumns = [...columnNames].filter((column) => !expectedColumns.has(column));
  if (missingColumns.length === 0 && unexpectedColumns.length === 0) {
    return;
  }

  throw new Error(
    `Unsupported documents table schema. Reset local SQL data before starting RemDo. Missing columns: ${missingColumns.join(', ') || 'none'}. Unexpected columns: ${unexpectedColumns.join(', ') || 'none'}.`
  );
}

function assertDocumentAccessTableShape(sqlite: Database.Database): void {
  const rows = sqlite
    .prepare('PRAGMA table_info(document_access)')
    .all() as Array<{ name: string }>;
  const expectedColumns = new Set(['document_id', 'grantee_user_id']);
  const columnNames = new Set(rows.map((row) => row.name));
  const missingColumns = [...expectedColumns].filter((column) => !columnNames.has(column));
  const unexpectedColumns = [...columnNames].filter((column) => !expectedColumns.has(column));
  if (missingColumns.length === 0 && unexpectedColumns.length === 0) {
    return;
  }

  throw new Error(
    `Unsupported document_access table schema. Reset local SQL data before starting RemDo. Missing columns: ${missingColumns.join(', ') || 'none'}. Unexpected columns: ${unexpectedColumns.join(', ') || 'none'}.`
  );
}

function ensureDocumentsTable(sqlite: Database.Database): void {
  const hasDocumentsTable = tableExists(sqlite, 'documents');
  if (!hasDocumentsTable) {
    sqlite.exec(CREATE_DOCUMENTS_TABLE_SQL);
    return;
  }

  assertDocumentsTableShape(sqlite);
  sqlite.exec(CREATE_DOCUMENTS_TABLE_SQL);
}

function assertSourceServersTableShape(sqlite: Database.Database): void {
  const rows = sqlite
    .prepare('PRAGMA table_info(source_servers)')
    .all() as Array<{ name: string }>;
  const expectedColumns = new Set(['base_url', 'client_id', 'client_secret', 'created_at']);
  const columnNames = new Set(rows.map((row) => row.name));
  const missingColumns = [...expectedColumns].filter((column) => !columnNames.has(column));
  const unexpectedColumns = [...columnNames].filter((column) => !expectedColumns.has(column));
  if (missingColumns.length === 0 && unexpectedColumns.length === 0) {
    return;
  }

  throw new Error(
    `Unsupported source_servers table schema. Reset local SQL data before starting RemDo. Missing columns: ${missingColumns.join(', ') || 'none'}. Unexpected columns: ${unexpectedColumns.join(', ') || 'none'}.`
  );
}

function ensureDocumentAccessTable(sqlite: Database.Database): void {
  const hasDocumentAccessTable = tableExists(sqlite, 'document_access');
  if (hasDocumentAccessTable) {
    assertDocumentAccessTableShape(sqlite);
  }
  sqlite.exec(CREATE_DOCUMENT_ACCESS_TABLE_SQL);

  if (tableExists(sqlite, 'source_servers')) {
    assertSourceServersTableShape(sqlite);
  }
  sqlite.exec(CREATE_SOURCE_SERVERS_TABLE_SQL);
}

export function createSqliteServerDatabaseClient({
  dbPath = resolveSqliteServerDatabasePath(),
}: SqliteServerDatabaseClientOptions = {}): SqliteServerDatabaseClient {
  if (shouldCreateParentDirectory(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  ensureDocumentsTable(sqlite);
  ensureDocumentAccessTable(sqlite);
  const db = new Kysely<RemdoDatabase>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  return {
    db,
    sqlite,
    async close() {
      await db.destroy();
      if (sqlite.open) {
        sqlite.close();
      }
    },
  };
}
