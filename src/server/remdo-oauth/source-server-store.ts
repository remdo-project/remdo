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

// Race-safe get-or-create for the lazy link path: inserts the row if absent and
// re-reads it, so two concurrent first-links to the same new source URL both
// succeed instead of one hitting the base_url primary-key collision. Unlike
// addSourceServer (which throws on a duplicate for its direct callers), this
// tolerates a concurrent insert.
export async function ensureSourceServerRow(
  database: SqliteServerDatabaseClient,
  url: string,
): Promise<StoredSourceServer> {
  const derived = deriveSourceServer(url);
  await database.db
    .insertInto('source_servers')
    .values({
      base_url: derived.baseUrl,
      client_id: null,
      created_at: Date.now(),
    })
    .onConflict((oc) => oc.column('base_url').doNothing())
    .execute();
  const row = await database.db
    .selectFrom('source_servers')
    .select(SOURCE_SERVER_READ_COLUMNS)
    .where('base_url', '=', derived.baseUrl)
    .executeTakeFirstOrThrow();
  return rowToStored(row);
}

// Claims a public client's id for a source on a FIRST-WRITER-WINS basis (public
// clients are secretless/PKCE, so there is no secret to store). Writes client_id
// only while it is still NULL, then returns the effective stored id. So when two
// concurrent first-links each register their own client, the row converges on one
// client_id and every caller (including an in-flight OAuth authorization) uses the
// same one — never overwriting a client another request may already be
// authorizing against. Returns null if the source row does not exist.
export async function claimSourceServerPublicClient(
  database: SqliteServerDatabaseClient,
  id: string,
  clientId: string,
): Promise<string | null> {
  const baseUrl = sourceOriginFromId(id);
  if (!baseUrl) {
    return null;
  }
  await database.db
    .updateTable('source_servers')
    .set({ client_id: clientId })
    .where('base_url', '=', baseUrl)
    .where('client_id', 'is', null)
    .execute();
  const row = await database.db
    .selectFrom('source_servers')
    .select('client_id')
    .where('base_url', '=', baseUrl)
    .executeTakeFirst();
  return row?.client_id ?? null;
}
