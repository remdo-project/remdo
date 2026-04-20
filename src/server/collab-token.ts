import { DocumentManager } from '@y-sweet/sdk';
import type { ClientToken } from '@y-sweet/sdk';
import { config } from '#config';
import type { RegisteredDocument } from './documents/document-registry';
import { rewriteTokenUrlsForRequest } from './token-url-rewrite';

type DocumentAuthorization = 'full' | 'read-only';

interface DocumentAccessResolution {
  allowed: boolean;
  authorization: DocumentAuthorization;
}

interface ResolveDocumentAccessArgs {
  document: RegisteredDocument;
  request: Request;
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

async function resolveDocumentAccess(_args: ResolveDocumentAccessArgs): Promise<DocumentAccessResolution> {
  // TODO: Enforce private/public/link-shared access here.
  return {
    allowed: true,
    authorization: 'full',
  };
}

export async function issueDocumentToken(
  manager: DocumentTokenManager,
  request: Request,
  document: RegisteredDocument,
): Promise<{ denied: true } | { denied: false; token: ClientToken }> {
  const access = await resolveDocumentAccess({ request, document });
  if (!access.allowed) {
    return { denied: true };
  }

  const token = await manager.getOrCreateDocAndToken(document.id, {
    authorization: access.authorization,
  });

  return {
    denied: false,
    token: rewriteTokenUrlsForRequest(token, request),
  };
}
