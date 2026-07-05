import type { SqliteServerDatabaseClient } from '#server/db/client';
import { registerPublicSourceClient } from '#server/remdo-oauth/source-client-registration';
import {
  ensureSourceServerRow,
  listSourceServers,
  setSourceServerPublicClient,
} from '#server/remdo-oauth/source-server-store';

export interface EnsureSourceClientParams {
  database: SqliteServerDatabaseClient;
  url: string;
  homeOrigin: string;
  scopes: readonly string[];
}

export interface EnsureSourceClientResult {
  sourceId: string;
  created: boolean;
}

// Ensures a public OAuth client exists for a source URL, self-registering one on
// first use and caching its client_id in source_servers. Idempotent: repeated
// links to the same URL (by any user) reuse the cached client. The caller
// rebuilds auth when `created` is true so a genericOAuth provider appears.
// Two concurrent first-links to the same new URL are race-safe at the row level
// (ensureSourceServerRow tolerates the duplicate insert); they may each register
// a client, and the last write wins the cached client_id — a benign redundancy
// (the orphaned public client is secretless and redirect-locked), not an error.
export async function ensureSourceClient(
  params: EnsureSourceClientParams,
  deps: { registerClient?: typeof registerPublicSourceClient } = {},
): Promise<EnsureSourceClientResult> {
  const registerClient = deps.registerClient ?? registerPublicSourceClient;
  const origin = new URL(params.url).origin;
  const servers = await listSourceServers(params.database);
  const existing = servers.find((server) => server.baseUrl === origin);
  if (existing?.credentials) {
    return { sourceId: existing.id, created: false };
  }

  const source = existing ?? (await ensureSourceServerRow(params.database, origin));
  const { clientId } = await registerClient({
    sourceBaseUrl: source.baseUrl,
    homeOrigin: params.homeOrigin,
    sourceId: source.id,
    scopes: params.scopes,
  });
  await setSourceServerPublicClient(params.database, source.id, clientId);
  return { sourceId: source.id, created: true };
}
