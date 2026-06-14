import type { DocumentNote } from '#note-sdk';

export function createShareableDocumentOptions(documents: readonly DocumentNote[]) {
  return documents
    .filter((document) => document.shareable())
    .map((document) => ({
      label: document.text(),
      value: document.id(),
    }));
}
