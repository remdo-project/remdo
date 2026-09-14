import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Kysely } from 'kysely';
import { config } from '#config';
import { ServerSqliteDialect } from './sqlite-dialect';
import { migrateServerDatabase } from './migrate';
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

export async function createSqliteServerDatabaseClient({
  dbPath = resolveSqliteServerDatabasePath(),
}: SqliteServerDatabaseClientOptions = {}): Promise<SqliteServerDatabaseClient> {
  if (shouldCreateParentDirectory(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = new Kysely<RemdoDatabase>({
    dialect: new ServerSqliteDialect({ database: sqlite }),
  });

  const client = {
    db,
    sqlite,
    async close() {
      await db.destroy();
      if (sqlite.open) {
        sqlite.close();
      }
    },
  };
  try {
    await migrateServerDatabase(db);
    return client;
  } catch (error) {
    // Construction failed before ownership could pass to the caller.
    await client.close().catch(() => {});
    throw error;
  }
}
