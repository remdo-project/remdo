import type { LinkableRemdoServer } from '#server/remdo-oauth/config';
import { deriveSourceId, deriveSourceLabel, deriveSourceServer } from '#server/remdo-oauth/config';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import type { SourceServersTable } from '#server/db/schema';

// A home's linkable source servers are a self-filling cache keyed by origin. A
// row is created on first link to a URL; its client_id is filled in once
// self-registration completes (docs/access-model.md#linking-a-source).

// Source clients are always public (PKCE, no secret), so a credential is just a
// client_id.
interface SourceClientCredentials {
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

// The cache version covers registration metadata that is not recoverable from
// the opaque client id itself (currently callback URI + protected resources).
// Unversioned values were registered by the predecessor flow and are refreshed
// lazily the next time a user links that source.
const CURRENT_CLIENT_ID_PREFIX = 'remdo:v1:';

function decodeClientId(value: string): string {
  return value.startsWith(CURRENT_CLIENT_ID_PREFIX)
    ? value.slice(CURRENT_CLIENT_ID_PREFIX.length)
    : value;
}

function encodeClientId(value: string): string {
  return `${CURRENT_CLIENT_ID_PREFIX}${value}`;
}

// base_url is the stored identity; id and label are both derived from it.
function rowToStored(row: SourceServerRow): StoredSourceServer {
  return {
    id: deriveSourceId(row.base_url),
    label: deriveSourceLabel(row.base_url),
    baseUrl: row.base_url,
    credentials:
      row.client_id
        ? { clientId: decodeClientId(row.client_id) }
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

// Race-safe get-or-create for the lazy link path (the sole way a source row is
// created): derives + validates the origin, inserts the row if absent, and
// re-reads it, so two concurrent first-links to the same new source URL both
// succeed instead of one hitting the base_url primary-key collision. Rejects a
// URL that is not a bare origin (via deriveSourceServer).
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
// only while it is still NULL, so concurrent first-links converge on one client
// id without overwriting a client another request may already be authorizing
// against.
export async function claimSourceServerPublicClient(
  database: SqliteServerDatabaseClient,
  baseUrl: string,
  clientId: string,
): Promise<void> {
  await database.db
    .updateTable('source_servers')
    .set({ client_id: encodeClientId(clientId) })
    .where('base_url', '=', baseUrl)
    .where('client_id', 'is', null)
    .execute();
}

export function hasCurrentSourceServerPublicClient(
  database: SqliteServerDatabaseClient,
  baseUrl: string,
): boolean {
  const row = database.sqlite
    .prepare('SELECT client_id FROM source_servers WHERE base_url = ?')
    .get(baseUrl) as Pick<SourceServerRow, 'client_id'> | undefined;
  return row?.client_id?.startsWith(CURRENT_CLIENT_ID_PREFIX) ?? false;
}

export async function replaceLegacySourceServerPublicClient(
  database: SqliteServerDatabaseClient,
  baseUrl: string,
  legacyClientId: string,
  clientId: string,
): Promise<void> {
  await database.db
    .updateTable('source_servers')
    .set({ client_id: encodeClientId(clientId) })
    .where('base_url', '=', baseUrl)
    .where('client_id', '=', legacyClientId)
    .execute();
}
