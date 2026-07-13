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
  favorites: readonly HomeDocumentEntry[];
  tags: readonly HomeDocumentEntry[];
  recents: readonly HomeDocumentEntry[];
}

// Builds Home's content from the live document sources. Favorites and Recents
// are static placeholder slices of the real document list; Tags is left empty to
// exercise the hide-when-empty rule. Replaced by real favoriting/tagging/
// visit-history sources later (see home.md#future).
export function buildHomeContent(documentSources: readonly DocumentSourceNote[]): HomeContent {
  const sources: HomeDocumentSource[] = documentSources.map((documentSource) => ({
    id: documentSource.id(),
    label: documentSource.text(),
    documents: documentSource.documents().children().map((document) => ({
      id: document.id(),
      label: document.text(),
    })),
  }));
  const allDocuments = sources.flatMap((source) => source.documents);
  return {
    sources,
    favorites: allDocuments.slice(0, 2),
    recents: allDocuments.slice(0, 3),
    tags: [],
  };
}
