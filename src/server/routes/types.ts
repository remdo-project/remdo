import type { ServerAuth } from '#server/auth/auth';
import type { YSweetDocumentTokenManager } from '#server/collab-token';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import type { DocumentRegistry } from '#server/documents/document-registry';
import type { RegistrationCodeStore } from '#server/remdo-oauth/registration-codes';
import type { RegistrationHandleStore } from '#server/remdo-oauth/registration-handles';

export interface ServerRouteDependencies {
  adminSecret?: string;
  auth: ServerAuth;
  database: SqliteServerDatabaseClient;
  rebuildAuth: () => void;
  registrationCodes: RegistrationCodeStore;
  registrationHandles: RegistrationHandleStore;
  tokenManager: YSweetDocumentTokenManager;
  registry: DocumentRegistry;
  logError: (error: unknown, details: { docId?: string }) => void;
}
