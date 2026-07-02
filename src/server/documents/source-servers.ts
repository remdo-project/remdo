import type { ServerAuth } from '#server/auth/auth';
import type { SourceServer } from '#domain/source-servers';

export async function listCurrentUserSourceServers(
  auth: ServerAuth,
  headers: Headers,
): Promise<SourceServer[]> {
  const linkedServerIds = await auth.listLinkedRemdoServerIds(headers);
  return auth.sourceServers.map((server) => ({
    id: server.id,
    label: server.label,
    baseUrl: server.baseUrl,
    linked: linkedServerIds.has(server.id),
  }));
}
