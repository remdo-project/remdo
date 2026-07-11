import { useCallback, useState } from 'react';
import { registerPendingDocumentImport } from '#client/editor/runtime/pending-document-import';
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
  docId,
  onSelectDocument,
  userData,
}: {
  docId: string;
  onSelectDocument: (docId: string) => void;
  userData: UserDataNote;
}) {
  const [errors, setErrors] = useState<{
    create: string | null;
    docId: string;
    upload: string | null;
  }>({ create: null, docId, upload: null });
  const currentErrors = errors.docId === docId
    ? errors
    : { create: null, docId, upload: null };

  if (errors.docId !== docId) {
    setErrors(currentErrors);
  }

  const createDocument = async () => {
    try {
      const nextDocument = await userData.documents().create('New Document');
      setErrors({ create: null, docId, upload: null });
      onSelectDocument(nextDocument.id());
    } catch (error) {
      setErrors({
        ...currentErrors,
        create: error instanceof Error ? error.message : 'Failed to create document.',
      });
    }
  };

  const uploadDocument = async (file: File) => {
    try {
      const nextDocument = await userData.documents().create(resolveUploadedDocumentTitle(file.name));
      registerPendingDocumentImport(nextDocument.id(), file);
      setErrors({ create: null, docId, upload: null });
      onSelectDocument(nextDocument.id());
    } catch (error) {
      setErrors({
        ...currentErrors,
        create: error instanceof Error ? error.message : 'Failed to create document.',
      });
    }
  };

  const handleImportError = useCallback((error: Error) => {
    setErrors((current) => ({ ...current, upload: error.message }));
  }, []);

  return {
    createDocument,
    createError: currentErrors.create,
    dismissCreateError: () => setErrors({ ...currentErrors, create: null }),
    dismissUploadError: () => setErrors({ ...currentErrors, upload: null }),
    handleImportError,
    uploadDocument,
    uploadError: currentErrors.upload,
  };
}
