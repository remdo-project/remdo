import type { LinkableRemdoServer } from '#server/remdo-oauth/config';
import { deriveSourceServer } from '#server/remdo-oauth/config';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import type { SourceServersTable } from '#server/db/schema';

// A home's linkable source servers are admin-managed DB state. A row exists once
// the admin adds a source; its client credentials are filled in once the home is
// registered on that source (docs/access-model.md#home-to-source-client-registration).

export interface SourceClientCredentials {
  clientId: string;
  clientSecret: string;
}

export interface StoredSourceServer extends LinkableRemdoServer {
  credentials: SourceClientCredentials | null;
}

type SourceServerRow = Pick<
  SourceServersTable,
  'id' | 'label' | 'base_url' | 'client_id' | 'client_secret'
>;

const SOURCE_SERVER_READ_COLUMNS = [
  'id', 'label', 'base_url', 'client_id', 'client_secret',
] as const;

function rowToStored(row: SourceServerRow): StoredSourceServer {
  return {
    id: row.id,
    label: row.label,
    baseUrl: row.base_url,
    credentials:
      row.client_id && row.client_secret
        ? { clientId: row.client_id, clientSecret: row.client_secret }
        : null,
  };
}

export async function listSourceServers(
  database: SqliteServerDatabaseClient,
): Promise<StoredSourceServer[]> {
  const rows = await database.db
    .selectFrom('source_servers')
    .select(SOURCE_SERVER_READ_COLUMNS)
    .orderBy('created_at', 'asc')
    .execute();
  return rows.map(rowToStored);
}

// Synchronous read for auth-instance construction, which builds the genericOAuth
// providers from the source list at startup (better-sqlite3 is synchronous).
export function readSourceServersSync(
  database: SqliteServerDatabaseClient,
): StoredSourceServer[] {
  const rows = database.sqlite
    .prepare(
      `SELECT ${SOURCE_SERVER_READ_COLUMNS.join(', ')} FROM source_servers ORDER BY created_at ASC`,
    )
    .all() as SourceServerRow[];
  return rows.map(rowToStored);
}

// Adds a source from its URL (deriving id/label/origin). Rejects a URL that is
// not a bare origin or that duplicates an existing source.
export async function addSourceServer(
  database: SqliteServerDatabaseClient,
  url: string,
): Promise<StoredSourceServer> {
  const derived = deriveSourceServer(url);
  const existing = await database.db
    .selectFrom('source_servers')
    .select('id')
    .where('id', '=', derived.id)
    .executeTakeFirst();
  if (existing) {
    throw new Error(`Source server ${derived.id} is already configured.`);
  }
  await database.db
    .insertInto('source_servers')
    .values({
      id: derived.id,
      label: derived.label,
      base_url: derived.baseUrl,
      client_id: null,
      client_secret: null,
      created_at: Date.now(),
    })
    .execute();
  return { ...derived, credentials: null };
}

export async function removeSourceServer(
  database: SqliteServerDatabaseClient,
  id: string,
): Promise<void> {
  await database.db.deleteFrom('source_servers').where('id', '=', id).execute();
}

// Records the OAuth client the home registered on the source. The provider for
// this source becomes usable at the next auth-instance build.
export async function setSourceServerCredentials(
  database: SqliteServerDatabaseClient,
  id: string,
  credentials: SourceClientCredentials,
): Promise<void> {
  const result = await database.db
    .updateTable('source_servers')
    .set({ client_id: credentials.clientId, client_secret: credentials.clientSecret })
    .where('id', '=', id)
    .executeTakeFirst();
  if (result.numUpdatedRows === 0n) {
    throw new Error(`Source server ${id} is not configured.`);
  }
}
