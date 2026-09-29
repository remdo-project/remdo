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

export interface HomeContent {
  sources: readonly HomeDocumentSource[];
}

export function buildHomeContent(documentSources: readonly DocumentSourceNote[]): HomeContent {
  return {
    sources: documentSources.map((documentSource) => ({
      id: documentSource.getId(),
      label: documentSource.getText(),
      documents: documentSource.getDocuments().getChildren().map((document) => ({
        id: document.getId(),
        label: document.getText(),
      })),
    })),
  };
}
