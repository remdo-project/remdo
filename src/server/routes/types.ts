import type { ServerAuth } from '#server/auth/auth';
import type { YSweetDocumentTokenManager } from '#server/collab-token';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import type { DocumentRegistry } from '#server/documents/document-registry';
import type { ServerDiagnosticReporter } from '#server/diagnostics';

export interface ServerRouteDependencies {
  adminSecret?: string;
  auth: ServerAuth;
  database: SqliteServerDatabaseClient;
  rebuildAuth: () => Promise<void>;
  tokenManager: YSweetDocumentTokenManager;
  registry: DocumentRegistry;
  logError: ServerDiagnosticReporter;
}
