import type { ServerAuth } from '#server/auth/auth';
import type { SourceServer } from '#domain/source-servers';

export async function listCurrentUserSourceServers(
  auth: ServerAuth,
  headers: Headers,
): Promise<SourceServer[]> {
  // Project only the sources THIS user has linked. The source_servers table is a
  // global client-id cache (any user's link adds a row), so it must not be
  // exposed across users: doing so would leak which sources others linked and let
  // one user seed another's Sharing page with a source to link (e.g. a look-alike
  // origin). A user links a new source by URL (docs/access-model.md#linking-a-source).
  const linkedServerIds = await auth.listLinkedRemdoServerIds(headers);
  return auth.sourceServers
    .filter((server) => linkedServerIds.has(server.id))
    .map((server) => ({
      id: server.id,
      label: server.label,
      baseUrl: server.baseUrl,
    }));
}
