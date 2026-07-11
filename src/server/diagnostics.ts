export type ServerDiagnosticEvent =
  | 'current-user.resolve-failed'
  | 'document.create-failed'
  | 'document.share-failed'
  | 'document-sync-token.issue-failed'
  | 'request.unhandled'
  | 'server.start-failed'
  | 'source-current-user.load-failed'
  | 'source-link.failed'
  | 'source-sync-token.issue-failed'
  | 'user-data-projection.refresh-failed';

export type ServerDiagnosticReporter = (event: ServerDiagnosticEvent) => void;

export const reportServerDiagnostic: ServerDiagnosticReporter = (event) => {
  console.error(`[remdo-api] ${event}`);
};
