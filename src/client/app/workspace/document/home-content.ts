import type { DocumentSourceNote } from '#note-sdk';
import { matchesPathQuery } from '#client/search/query-match';
import { formatNavigationLabel } from '#client/ui/navigation-label';

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

export function filterHomeSources(sources: readonly HomeDocumentSource[], query: string): HomeDocumentSource[] {
  return sources.map((source) => ({
    ...source,
    documents: source.documents.filter((document) => (
      matchesPathQuery([formatNavigationLabel(document.label, Number.POSITIVE_INFINITY)], query)
    )),
  }));
}
