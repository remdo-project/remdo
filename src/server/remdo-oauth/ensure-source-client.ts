import type { SqliteServerDatabaseClient } from '#server/db/client';
import { registerPublicSourceClient } from '#server/remdo-oauth/source-client-registration';
import {
  claimSourceServerPublicClient,
  ensureSourceServerRow,
  hasCurrentSourceServerPublicClient,
  replaceLegacySourceServerPublicClient,
} from '#server/remdo-oauth/source-server-store';

export interface EnsureSourceClientParams {
  database: SqliteServerDatabaseClient;
  sourceOrigin: string;
  homeOrigin: string;
  scopes: readonly string[];
}

export interface EnsureSourceClientResult {
  sourceId: string;
}

// Ensures a public OAuth client exists for a source origin, self-registering one
// on first use and caching its client_id in source_servers. Idempotent: repeated
// links to the same source (by any user) reuse the cached client. The caller
// must rebuild auth before using the returned source (see source-links.ts) so
// the genericOAuth provider is live in this process.
//
// Concurrent first-links to the same new URL are safe: the row create tolerates
// the duplicate (ensureSourceServerRow), and the client_id is claimed
// first-writer-wins (claimSourceServerPublicClient) so the row converges on one
// client and no request overwrites a client another may already be authorizing
// against. A loser's freshly-registered client is left orphaned on the source —
// harmless (secretless, redirect-locked). The caller rebuilds unconditionally, so
// a request that observed another racer's just-written credentials still makes the
// provider live before OAuth rather than racing that racer's own rebuild.
export async function ensureSourceClient(
  params: EnsureSourceClientParams,
  deps: { registerClient?: typeof registerPublicSourceClient } = {},
): Promise<EnsureSourceClientResult> {
  const registerClient = deps.registerClient ?? registerPublicSourceClient;
  // Get-or-create the row (idempotent, race-safe). Reuse only clients carrying
  // the current cache version; predecessor registrations used a different
  // callback/resource contract and must be replaced before OAuth starts.
  const source = await ensureSourceServerRow(params.database, params.sourceOrigin);
  if (source.credentials && hasCurrentSourceServerPublicClient(params.database, source.baseUrl)) {
    return { sourceId: source.id };
  }

  const { clientId } = await registerClient({
    sourceBaseUrl: source.baseUrl,
    homeOrigin: params.homeOrigin,
    sourceId: source.id,
    scopes: params.scopes,
  });
  if (source.credentials) {
    replaceLegacySourceServerPublicClient(
      params.database,
      source.baseUrl,
      source.credentials.clientId,
      clientId,
    );
  } else {
    await claimSourceServerPublicClient(params.database, source.baseUrl, clientId);
  }
  return { sourceId: source.id };
}
