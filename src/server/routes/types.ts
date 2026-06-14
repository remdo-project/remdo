import type { ServerAuth } from '#server/auth/auth';
import type { YSweetDocumentTokenManager } from '#server/collab-token';
import type { DocumentRegistry } from '#server/documents/document-registry';

export interface ServerRouteDependencies {
  adminSecret?: string;
  auth: ServerAuth;
  tokenManager: YSweetDocumentTokenManager;
  registry: DocumentRegistry;
  logError: (error: unknown, details: { docId?: string }) => void;
}
