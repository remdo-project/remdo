import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '#config';
import {
  CREATE_DOCUMENT_ACCESS_TABLE_SQL,
  CREATE_DOCUMENTS_TABLE_SQL,
  DOCUMENT_ACCESS_MODES,
  DOCUMENTS_TABLE_COLUMNS,
} from './schema';

const SQLITE_BUSY_TIMEOUT_MS = 5000;

export interface ServerDatabaseClient {
  close: () => void;
  sqlite: DatabaseSync;
}

interface ServerDatabaseClientOptions {
  dbPath?: string;
}

export function resolveServerDatabasePath(): string {
  return path.join(config.env.DATA_DIR, 'remdo.sqlite');
}

function shouldCreateParentDirectory(dbPath: string): boolean {
  return dbPath !== ':memory:' && dbPath !== '';
}

function tableExists(sqlite: DatabaseSync, tableName: string): boolean {
  const row = sqlite
    .prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?')
    .get('table', tableName);
  return Boolean(row);
}

function assertDocumentsTableShape(sqlite: DatabaseSync): void {
  const rows = sqlite
    .prepare('PRAGMA table_info(documents)')
    .all() as Array<{ name: string }>;
  const expectedColumns = new Set<string>(DOCUMENTS_TABLE_COLUMNS);
  const columnNames = new Set(rows.map((row) => row.name));
  const missingColumns = DOCUMENTS_TABLE_COLUMNS.filter((column) => !columnNames.has(column));
  const unexpectedColumns = [...columnNames].filter((column) => !expectedColumns.has(column));
  if (missingColumns.length === 0 && unexpectedColumns.length === 0) {
    const tableSql = sqlite
      .prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?')
      .get('table', 'documents') as { sql?: string } | undefined;
    const unsupportedAccessModes = DOCUMENT_ACCESS_MODES.filter((mode) => !tableSql?.sql?.includes(`'${mode}'`));
    if (unsupportedAccessModes.length === 0) {
      return;
    }
  }

  throw new Error(
    `Unsupported documents table schema. Reset local SQL data before starting RemDo. Missing columns: ${missingColumns.join(', ') || 'none'}. Unexpected columns: ${unexpectedColumns.join(', ') || 'none'}.`
  );
}

function ensureDocumentsTable(sqlite: DatabaseSync): void {
  const hasDocumentsTable = tableExists(sqlite, 'documents');
  if (!hasDocumentsTable) {
    sqlite.exec(CREATE_DOCUMENTS_TABLE_SQL);
    return;
  }

  assertDocumentsTableShape(sqlite);
  sqlite.exec(CREATE_DOCUMENTS_TABLE_SQL);
}

function ensureDocumentAccessTable(sqlite: DatabaseSync): void {
  sqlite.exec(CREATE_DOCUMENT_ACCESS_TABLE_SQL);
}

export function createServerDatabaseClient({
  dbPath = resolveServerDatabasePath(),
}: ServerDatabaseClientOptions = {}): ServerDatabaseClient {
  if (shouldCreateParentDirectory(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  ensureDocumentsTable(sqlite);
  ensureDocumentAccessTable(sqlite);

  return {
    sqlite,
    close() {
      sqlite.close();
    },
  };
}
