import type { LinkableRemdoServer } from '#server/remdo-oauth/config';
import { deriveSourceId, deriveSourceLabel, deriveSourceServer, sourceOriginFromId } from '#server/remdo-oauth/config';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import type { SourceServersTable } from '#server/db/schema';

// A home's linkable source servers are a self-filling cache keyed by origin. A
// row is created on first link to a URL; its client_id is filled in once
// self-registration completes (docs/access-model.md#linking-a-source).

// Source clients are always public (PKCE, no secret), so a credential is just a
// client_id.
export interface SourceClientCredentials {
  clientId: string;
}

export interface StoredSourceServer extends LinkableRemdoServer {
  credentials: SourceClientCredentials | null;
}

type SourceServerRow = Pick<
  SourceServersTable,
  'base_url' | 'client_id'
>;

const SOURCE_SERVER_READ_COLUMNS = [
  'base_url', 'client_id',
] as const;

// base_url is the stored identity; id and label are both derived from it.
function rowToStored(row: SourceServerRow): StoredSourceServer {
  return {
    id: deriveSourceId(row.base_url),
    label: deriveSourceLabel(row.base_url),
    baseUrl: row.base_url,
    credentials:
      row.client_id
        ? { clientId: row.client_id }
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

// Adds a source from its URL (deriving id/origin; label is derived on read).
// Rejects a URL that is not a bare origin or that duplicates an existing source.
export async function addSourceServer(
  database: SqliteServerDatabaseClient,
  url: string,
): Promise<StoredSourceServer> {
  const derived = deriveSourceServer(url);
  const existing = await database.db
    .selectFrom('source_servers')
    .select('base_url')
    .where('base_url', '=', derived.baseUrl)
    .executeTakeFirst();
  if (existing) {
    throw new Error(`Source server ${derived.baseUrl} is already configured.`);
  }
  await database.db
    .insertInto('source_servers')
    .values({
      base_url: derived.baseUrl,
      client_id: null,
      created_at: Date.now(),
    })
    .execute();
  return { ...derived, credentials: null };
}

// Persists a public client's id (no secret). Public clients authenticate via
// PKCE, so there is no secret to store.
export async function setSourceServerPublicClient(
  database: SqliteServerDatabaseClient,
  id: string,
  clientId: string,
): Promise<void> {
  const baseUrl = sourceOriginFromId(id);
  const result = baseUrl
    ? await database.db
      .updateTable('source_servers')
      .set({ client_id: clientId })
      .where('base_url', '=', baseUrl)
      .executeTakeFirst()
    : null;
  if (!result || result.numUpdatedRows === 0n) {
    throw new Error(`Source server ${id} is not configured.`);
  }
}
