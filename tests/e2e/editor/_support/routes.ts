function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

export function createEditorDocumentPath(docId: string, noteId: string | null = null): string {
  return noteId ? `/e2e/n/${docId}_${noteId}` : `/e2e/n/${docId}`;
}

export function createEditorDocumentPathRegExp(docId: string, noteId: string): RegExp {
  const path = createEditorDocumentPath(docId, noteId);
  return new RegExp(`${escapeRegExp(path)}$`);
}
