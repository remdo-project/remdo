import type { DocumentNote } from '#note-sdk';
import { matchesPathQuery } from '#client/search/query-match';
import { formatNavigationLabel } from '#client/ui/navigation-label';

export function filterHomeDocuments(documents: readonly DocumentNote[], query: string): DocumentNote[] {
  return documents.filter((document) => (
    matchesPathQuery([formatNavigationLabel(document.getText(), Number.POSITIVE_INFINITY)], query)
  ));
}
