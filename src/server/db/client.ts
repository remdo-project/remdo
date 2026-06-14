import { createSqliteServerDatabaseClient } from './sqlite-client';
import type { SqliteServerDatabaseClient } from './sqlite-client';
import type { ServerDatabaseClient } from './types';

interface ServerDatabaseClientOptions {
  dbPath?: string;
}

export type { ServerDatabaseClient, SqliteServerDatabaseClient };

export function createServerDatabaseClient(
  options: ServerDatabaseClientOptions = {},
): SqliteServerDatabaseClient {
  return createSqliteServerDatabaseClient(options);
}
