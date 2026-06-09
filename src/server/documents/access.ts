import type { DocumentAccessView } from '#domain/documents/access';
import type { ServerAuth } from '#server/auth/auth';
import type { DocumentRegistry } from './document-registry';

export async function listDocumentAccessViewsForOwner(
  registry: DocumentRegistry,
  auth: ServerAuth,
  documentId: string,
  ownerUserId: string,
): Promise<DocumentAccessView[]> {
  const grants = await registry.listDocumentAccessForOwner(documentId, ownerUserId);
  const users = await auth.listUsersByIds(grants.map((grant) => grant.granteeUserId));
  const usersById = new Map(users.map((user) => [user.id, user]));
  return grants.flatMap((grant) => {
    const user = usersById.get(grant.granteeUserId);
    return user
      ? [{
          documentId: grant.documentId,
          email: user.email,
          granteeUserId: grant.granteeUserId,
          name: user.name,
        }]
      : [];
  });
}
