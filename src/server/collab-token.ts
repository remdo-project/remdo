import { DocumentManager } from '@y-sweet/sdk';
import type { ClientToken } from '@y-sweet/sdk';
import { config } from '#config';
import { rewriteTokenUrlsForRequest } from './token-url-rewrite';

type DocumentAuthorization = 'full' | 'read-only';

interface DocumentAccessResolution {
  allowed: boolean;
  authorization: DocumentAuthorization;
}

export interface DocumentTokenManager {
  getOrCreateDocAndToken: (
    docId: string,
    authDocRequest?: { authorization?: DocumentAuthorization },
  ) => Promise<ClientToken>;
}

export function createDocumentManager(): DocumentTokenManager {
  return new DocumentManager(resolveYSweetConnectionString());
}

function resolveYSweetConnectionString(): string {
  return config.env.YSWEET_CONNECTION_STRING;
}

async function resolveDocumentAccess(_docId: string): Promise<DocumentAccessResolution> {
  // TODO: Enforce private/public/link-shared document access here once RemDo owns document ACL decisions.
  return {
    allowed: true,
    authorization: 'full',
  };
}

export async function issueDocumentToken(
  manager: DocumentTokenManager,
  request: Request,
  docId: string,
): Promise<{ denied: true } | { denied: false; token: ClientToken }> {
  const access = await resolveDocumentAccess(docId);
  if (!access.allowed) {
    return { denied: true };
  }

  const token = await manager.getOrCreateDocAndToken(docId, {
    authorization: access.authorization,
  });

  return {
    denied: false,
    token: rewriteTokenUrlsForRequest(token, request),
  };
}
