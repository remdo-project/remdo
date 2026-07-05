import type { ServerAuth } from '#server/auth/auth';
import type { SourceServer } from '#domain/source-servers';

export async function listCurrentUserSourceServers(
  auth: ServerAuth,
  headers: Headers,
): Promise<SourceServer[]> {
  const linkedServerIds = await auth.listLinkedRemdoServerIds(headers);
  // A source row can exist with no cached client (e.g. a prior self-registration
  // attempt failed before the client_id persisted), so it has no live OAuth
  // provider and cannot be linked. Hide it from user linking — surfacing it would
  // offer a Link that fails with no provider. It becomes visible once
  // self-registration persists a client_id
  // (docs/access-model.md#linking-a-source).
  return auth.sourceServers
    .filter((server) => server.credentials !== null)
    .map((server) => ({
      id: server.id,
      label: server.label,
      baseUrl: server.baseUrl,
      linked: linkedServerIds.has(server.id),
    }));
}
