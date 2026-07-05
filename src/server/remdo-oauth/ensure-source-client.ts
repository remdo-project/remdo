import type { SqliteServerDatabaseClient } from '#server/db/client';
import { registerPublicSourceClient } from '#server/remdo-oauth/source-client-registration';
import {
  claimSourceServerPublicClient,
  ensureSourceServerRow,
  listSourceServers,
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
//
// Concurrent first-links to the same new URL are safe: the row create tolerates
// the duplicate (ensureSourceServerRow), and the client_id is claimed
// first-writer-wins (claimSourceServerPublicClient) so the row converges on one
// client and no request overwrites a client another may already be authorizing
// against. A loser's freshly-registered client is left orphaned on the source —
// harmless (secretless, redirect-locked) — and `created` is false for it, so it
// triggers no redundant rebuild.
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
  const effectiveClientId = await claimSourceServerPublicClient(params.database, source.id, clientId);
  // `created` (→ caller rebuilds auth) only when THIS call's client won the claim.
  return { sourceId: source.id, created: effectiveClientId === clientId };
}
