import { DocumentManager } from '@y-sweet/sdk';
import type { ClientToken } from '@y-sweet/sdk';
import { config } from '#config';
import type { Actor } from './auth/actor';
import type { RegisteredDocument } from './documents/document-registry';
import { rewriteTokenUrlsForRequest } from './token-url-rewrite';

// Y-Sweet defines the authorization union internally but does not export it.
// Deriving it from ClientToken keeps this wrapper tied to Y-Sweet's accepted
// values without duplicating string literals locally.
type DocumentAuthorization = NonNullable<ClientToken['authorization']>;

type DocumentAccessResolution =
  | { allowed: false }
  | { allowed: true; authorization: DocumentAuthorization };

interface ResolveDocumentAccessArgs {
  actor: Actor;
  document: RegisteredDocument;
}

interface ResolveYSweetConnectionStringOptions {
  connectionString?: string;
  serverToken?: string;
}

export interface DocumentTokenManager {
  getDocAsUpdate: (docId: string) => Promise<Uint8Array>;
  getOrCreateDocAndToken: (
    docId: string,
    authDocRequest?: { authorization?: DocumentAuthorization },
  ) => Promise<ClientToken>;
  updateDoc: (docId: string, update: Uint8Array) => Promise<void>;
}

export function createDocumentTokenManager(): DocumentTokenManager {
  return new DocumentManager(resolveYSweetConnectionString());
}

export function resolveYSweetConnectionString({
  connectionString = config.env.YSWEET_CONNECTION_STRING,
  serverToken = config.env.YSWEET_SERVER_TOKEN,
}: ResolveYSweetConnectionStringOptions = {}): string {
  const parsed = new URL(connectionString);
  if (parsed.username) {
    return connectionString;
  }

  if (!serverToken) {
    throw new Error('YSWEET_SERVER_TOKEN is required when YSWEET_CONNECTION_STRING does not include server auth.');
  }

  parsed.username = serverToken;
  return parsed.toString();
}

async function resolveDocumentAccess({ actor, document }: ResolveDocumentAccessArgs): Promise<DocumentAccessResolution> {
  if (document.accessMode === 'private' && document.ownerUserId !== actor.userId) {
    return { allowed: false };
  }

  return {
    allowed: true,
    authorization: document.kind === 'user-config' ? 'read-only' : 'full',
  };
}

export async function issueDocumentToken(
  tokenManager: DocumentTokenManager,
  actor: Actor,
  document: RegisteredDocument,
  request: Request,
): Promise<{ denied: true } | { denied: false; token: ClientToken }> {
  const access = await resolveDocumentAccess({ actor, document });
  if (!access.allowed) {
    return { denied: true };
  }

  const token = await tokenManager.getOrCreateDocAndToken(document.id, {
    authorization: access.authorization,
  });

  return {
    denied: false,
    token: rewriteTokenUrlsForRequest(token, request),
  };
}
