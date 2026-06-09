import { syncYjsOrderedMapArray } from '#projection/yjs-ordered-map-array';
import type { UserDocument } from '#domain/documents/user-data';
import type { SourceServer } from '#domain/source-servers';
import type * as Y from 'yjs';

export function syncUserDocumentsMapArray(
  array: Y.Array<Y.Map<unknown>>,
  documents: readonly UserDocument[],
): void {
  syncYjsOrderedMapArray(array, documents, {
    valuesOf: (document) => ({
      id: document.id,
      title: document.title,
    }),
  });
}

export function syncSourceServersMapArray(
  array: Y.Array<Y.Map<unknown>>,
  sourceServers: readonly SourceServer[],
): void {
  syncYjsOrderedMapArray(array, sourceServers, {
    valuesOf: (sourceServer) => ({
      id: sourceServer.id,
      label: sourceServer.label,
      baseUrl: sourceServer.baseUrl,
      linked: sourceServer.linked,
    }),
  });
}
