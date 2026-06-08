import { syncYjsOrderedMapArray } from '@/projection/yjs-ordered-map-array';
import type * as Y from 'yjs';

interface UserDocumentProjection {
  id: string;
  title: string;
}

export function syncUserDocumentsMapArray(
  array: Y.Array<Y.Map<unknown>>,
  documents: readonly UserDocumentProjection[],
): void {
  syncYjsOrderedMapArray(array, documents, {
    valuesOf: (document) => ({
      id: document.id,
      title: document.title,
    }),
  });
}
