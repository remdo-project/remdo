import { useState } from 'react';
import { registerPendingDocumentImport } from '#client/editor/view/workspace';
import type { UserDataNote } from '#note-sdk';

const UPLOADED_JSON_EXTENSION = '.json';
const WHITESPACE_PATTERN = /\s+/gu;

function resolveUploadedDocumentTitle(fileName: string): string {
  const withoutExtension = fileName.toLowerCase().endsWith(UPLOADED_JSON_EXTENSION)
    ? fileName.slice(0, -UPLOADED_JSON_EXTENSION.length)
    : fileName;
  const normalized = withoutExtension.trim().replaceAll(WHITESPACE_PATTERN, ' ');
  return normalized.length > 0 ? normalized : 'Imported Document';
}

export function useDocumentActions({
  onSelectDocument,
  userData,
}: {
  onSelectDocument: (docId: string) => void;
  userData: UserDataNote;
}) {
  const [createError, setCreateError] = useState<string | null>(null);

  const createDocument = async () => {
    try {
      const nextDocument = await userData.getDocuments().create('New Document');
      setCreateError(null);
      onSelectDocument(nextDocument.getId());
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create document.');
    }
  };

  const uploadDocument = async (file: File) => {
    try {
      const nextDocument = await userData.getDocuments().create(resolveUploadedDocumentTitle(file.name));
      registerPendingDocumentImport(nextDocument.getId(), file);
      setCreateError(null);
      onSelectDocument(nextDocument.getId());
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create document.');
    }
  };

  return {
    createDocument,
    createError,
    dismissCreateError: () => setCreateError(null),
    uploadDocument,
  };
}
