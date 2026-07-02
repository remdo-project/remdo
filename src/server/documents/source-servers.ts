import type { ServerAuth } from '#server/auth/auth';
import type { SourceServer } from '#domain/source-servers';

export async function listCurrentUserSourceServers(
  auth: ServerAuth,
  headers: Headers,
): Promise<SourceServer[]> {
  const linkedServerIds = await auth.listLinkedRemdoServerIds(headers);
  // A source with no credentials is not yet registered (an admin added the row
  // but has not completed register-home), so it has no live OAuth provider and
  // cannot be linked. Hide it from user linking — surfacing it would offer a Link
  // that fails with no provider. It becomes visible once registration persists
  // its credentials (docs/access-model.md#registering-a-home-on-a-source).
  return auth.sourceServers
    .filter((server) => server.credentials !== null)
    .map((server) => ({
      id: server.id,
      label: server.label,
      baseUrl: server.baseUrl,
      linked: linkedServerIds.has(server.id),
    }));
}
