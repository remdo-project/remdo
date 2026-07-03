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

// Raise a clear "reset local SQL data" error when an on-disk table's columns
// don't match the current schema — so a stale dev DB fails loudly at startup
// rather than with cryptic constraint errors on the first write.
function assertTableShape(
  sqlite: Database.Database,
  tableName: string,
  expectedColumns: readonly string[],
): void {
  const columnNames = new Set(
    (sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>)
      .map((row) => row.name),
  );
  const expected = new Set(expectedColumns);
  const missingColumns = expectedColumns.filter((column) => !columnNames.has(column));
  const unexpectedColumns = [...columnNames].filter((column) => !expected.has(column));
  if (missingColumns.length === 0 && unexpectedColumns.length === 0) {
    return;
  }

  throw new Error(
    `Unsupported ${tableName} table schema. Reset local SQL data before starting RemDo. Missing columns: ${missingColumns.join(', ') || 'none'}. Unexpected columns: ${unexpectedColumns.join(', ') || 'none'}.`
  );
}

function ensureDocumentsTable(sqlite: Database.Database): void {
  const hasDocumentsTable = tableExists(sqlite, 'documents');
  if (!hasDocumentsTable) {
    sqlite.exec(CREATE_DOCUMENTS_TABLE_SQL);
    return;
  }

  assertTableShape(sqlite, 'documents', DOCUMENTS_TABLE_COLUMNS);
  sqlite.exec(CREATE_DOCUMENTS_TABLE_SQL);
}

function ensureDocumentAccessTable(sqlite: Database.Database): void {
  if (tableExists(sqlite, 'document_access')) {
    assertTableShape(sqlite, 'document_access', ['document_id', 'grantee_user_id']);
  }
  sqlite.exec(CREATE_DOCUMENT_ACCESS_TABLE_SQL);

  if (tableExists(sqlite, 'source_servers')) {
    assertTableShape(sqlite, 'source_servers', ['base_url', 'client_id', 'client_secret', 'created_at']);
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
