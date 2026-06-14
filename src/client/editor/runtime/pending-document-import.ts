interface PendingDocumentImport {
  file: File;
}

const pendingDocumentImports = new Map<string, PendingDocumentImport>();

export function registerPendingDocumentImport(docId: string, file: File): void {
  pendingDocumentImports.set(docId, { file });
}

export function claimPendingDocumentImport(docId: string): PendingDocumentImport | null {
  const pending = pendingDocumentImports.get(docId);
  if (!pending) {
    return null;
  }
  pendingDocumentImports.delete(docId);
  return pending;
}
