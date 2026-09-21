import type { DocumentSourceNote } from '#note-sdk';

export function resolveDocumentSource(
  docId: string,
  documentSources: readonly DocumentSourceNote[],
) {
  const currentSource = documentSources.find((source) => source.getDocuments().getById(docId)) ?? null;
  const currentDocument = currentSource?.getDocuments().getById(docId) ?? null;

  return {
    documentLabel: currentDocument?.getText() ?? docId,
  };
}
