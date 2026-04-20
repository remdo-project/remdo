import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '#config';
import { CREATE_DOCUMENTS_TABLE_SQL } from './schema';

export interface ServerDatabaseClient {
  close: () => void;
  sqlite: DatabaseSync;
}

interface ServerDatabaseClientOptions {
  dbPath?: string;
}

function resolveDefaultDbPath(): string {
  return path.join(config.env.DATA_DIR, 'remdo.sqlite');
}

function shouldCreateParentDirectory(dbPath: string): boolean {
  return dbPath !== ':memory:' && dbPath !== '';
}

export function createServerDatabaseClient({
  dbPath = resolveDefaultDbPath(),
}: ServerDatabaseClientOptions = {}): ServerDatabaseClient {
  if (shouldCreateParentDirectory(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec(CREATE_DOCUMENTS_TABLE_SQL);

  return {
    sqlite,
    close() {
      sqlite.close();
    },
  };
}
