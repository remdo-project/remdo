import { syncYjsOrderedMapArray } from '#projection/yjs-ordered-map-array';
import type { DocumentAccessView } from '#domain/documents/access';
import type { UserDocument } from '#domain/documents/user-data';
import type { SourceServer } from '#domain/source-servers';
import * as Y from 'yjs';

const ACCESS_KEY = 'access';

function readMapId(entry: Y.Map<unknown>): string | null {
  const value = entry.get('id');
  return typeof value === 'string' ? value : null;
}

function syncDocumentAccessMapArray(
  array: Y.Array<Y.Map<unknown>>,
  access: readonly DocumentAccessView[],
): void {
  syncYjsOrderedMapArray(array, access, {
    valuesOf: (grant) => ({
      id: grant.granteeUserId,
      documentId: grant.documentId,
      email: grant.email,
      granteeUserId: grant.granteeUserId,
      name: grant.name,
    }),
  });
}

export function syncUserDocumentsMapArray(
  array: Y.Array<Y.Map<unknown>>,
  documents: readonly UserDocument[],
): void {
  syncYjsOrderedMapArray(array, documents, {
    preserveKeys: [ACCESS_KEY],
    valuesOf: (document) => ({
      id: document.id,
      title: document.title,
    }),
  });

  const entriesById = new Map(array.toArray().map((entry) => [readMapId(entry), entry]));
  for (const document of documents) {
    if (!document.access) {
      continue;
    }
    const entry = entriesById.get(document.id);
    if (!entry) {
      continue;
    }
    const existingAccess = entry.get(ACCESS_KEY);
    const accessArray = existingAccess instanceof Y.Array ? existingAccess : new Y.Array<Y.Map<unknown>>();
    if (!(existingAccess instanceof Y.Array)) {
      entry.set(ACCESS_KEY, accessArray);
    }
    syncDocumentAccessMapArray(accessArray, document.access);
  }
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
