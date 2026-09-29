import type { DocumentSourceNote } from '#note-sdk';

export interface HomeDocumentEntry {
  id: string;
  label: string;
}

export interface HomeDocumentSource {
  id: string;
  label: string;
  documents: readonly HomeDocumentEntry[];
}

export function buildHomeSources(documentSources: readonly DocumentSourceNote[]): HomeDocumentSource[] {
  return documentSources.map((documentSource) => ({
    id: documentSource.getId(),
    label: documentSource.getText(),
    documents: documentSource.getDocuments().getChildren().map((document) => ({
      id: document.getId(),
      label: document.getText(),
    })),
  }));
}
