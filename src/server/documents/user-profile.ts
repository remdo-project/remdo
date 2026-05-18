import type { DocumentTokenManager } from '@/server/collab-token';
import type { DocumentKind } from '@/server/db/schema';
import { syncListedDocumentsMapArray } from '@/server/yjs/projection';
import type { DocumentRegistry, RegisteredDocument } from './document-registry';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import { HOME_DOCUMENT_TITLE } from '@/documents/contracts';
import * as Y from 'yjs';

interface UserProfile {
  homeDocumentId: string;
  configDocumentId: string;
}

interface CreatedProfileDocument {
  id: string;
  title: string;
}

const USER_CONFIG_ROOT_NOTE_ID = 'user-config';
const DOCUMENTS_KEY = 'documents';
const USER_CONFIG_TITLE = 'User Config';
const DOCUMENT_ID_ALLOCATION_ATTEMPTS = 64;

type UserSpecialDocumentKind = Exclude<DocumentKind, 'document'>;

interface UserProfileDocuments {
  configDocument: RegisteredDocument;
  homeDocument: RegisteredDocument;
}

function writeUserConfigProjection(
  doc: Y.Doc,
  documents: readonly Pick<RegisteredDocument, 'id' | 'title'>[],
): void {
  const root = doc.getMap<Y.Array<Y.Map<unknown>>>(USER_CONFIG_ROOT_NOTE_ID);
  const existing = root.get(DOCUMENTS_KEY);
  const documentList = existing instanceof Y.Array ? existing : new Y.Array<Y.Map<unknown>>();

  doc.transact(() => {
    if (!(existing instanceof Y.Array)) {
      root.set(DOCUMENTS_KEY, documentList);
    }
    syncListedDocumentsMapArray(documentList, documents);
  });
}

async function refreshUserConfigProjection(
  registry: DocumentRegistry,
  tokenManager: DocumentTokenManager,
  userId: string,
  configDocumentId: string,
): Promise<void> {
  await tokenManager.getOrCreateDocAndToken(configDocumentId, { authorization: 'read-only' });

  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, await tokenManager.getDocAsUpdate(configDocumentId));
    writeUserConfigProjection(doc, await registry.listUserDocuments(userId));
    await tokenManager.updateDoc(configDocumentId, Y.encodeStateAsUpdate(doc));
  } finally {
    doc.destroy();
  }
}

async function ensureUserConfigDocument(
  registry: DocumentRegistry,
  userId: string,
  { createDocumentId }: { createDocumentId?: () => string },
): Promise<RegisteredDocument> {
  return ensureUserSpecialDocument(registry, userId, 'user-config', USER_CONFIG_TITLE, {
    createDocumentId,
  });
}

async function ensureUserHomeDocument(
  registry: DocumentRegistry,
  userId: string,
  { createDocumentId }: { createDocumentId?: () => string },
): Promise<RegisteredDocument> {
  return ensureUserSpecialDocument(registry, userId, 'home-document', HOME_DOCUMENT_TITLE, {
    createDocumentId,
  });
}

async function ensureUserSpecialDocument(
  registry: DocumentRegistry,
  userId: string,
  kind: UserSpecialDocumentKind,
  title: string,
  { createDocumentId }: { createDocumentId?: () => string },
): Promise<RegisteredDocument> {
  const existing = await registry.getUserDocumentByKind(userId, kind);
  if (existing) {
    return existing;
  }

  return createProfileDocumentRecord(registry, userId, title, {
    createDocumentId,
    kind,
  });
}

async function createProfileDocumentRecord(
  registry: DocumentRegistry,
  userId: string,
  title: string,
  {
    createDocumentId = createUniqueNoteId,
    kind = 'document',
  }: { createDocumentId?: () => string; kind?: DocumentKind } = {},
): Promise<RegisteredDocument> {
  for (let attempt = 0; attempt < DOCUMENT_ID_ALLOCATION_ATTEMPTS; attempt += 1) {
    const document = await registry.insertDocument({
      id: createDocumentId(),
      kind,
      ownerUserId: userId,
      title,
    });
    if (document) {
      return document;
    }
    if (kind !== 'document') {
      const existing = await registry.getUserDocumentByKind(userId, kind);
      if (existing) {
        return existing;
      }
    }
  }

  throw new Error(`Failed to allocate ${kind} document for user ${userId}.`);
}

async function ensureUserProfileDocuments(
  registry: DocumentRegistry,
  userId: string,
  { createDocumentId }: { createDocumentId?: () => string } = {},
): Promise<UserProfileDocuments> {
  const configDocument = await ensureUserConfigDocument(registry, userId, { createDocumentId });
  const homeDocument = await ensureUserHomeDocument(registry, userId, { createDocumentId });

  return { configDocument, homeDocument };
}

export async function ensureUserProfile(
  registry: DocumentRegistry,
  tokenManager: DocumentTokenManager,
  userId: string,
  { createDocumentId }: { createDocumentId?: () => string } = {},
): Promise<UserProfile> {
  const { configDocument, homeDocument } = await ensureUserProfileDocuments(registry, userId, {
    createDocumentId,
  });

  await refreshUserConfigProjection(registry, tokenManager, userId, configDocument.id);

  return {
    configDocumentId: configDocument.id,
    homeDocumentId: homeDocument.id,
  };
}

export async function createListedProfileDocument(
  registry: DocumentRegistry,
  tokenManager: DocumentTokenManager,
  userId: string,
  title: string,
  { createDocumentId }: { createDocumentId?: () => string } = {},
): Promise<CreatedProfileDocument> {
  const { configDocument } = await ensureUserProfileDocuments(registry, userId, { createDocumentId });
  const document = await createProfileDocumentRecord(registry, userId, title, { createDocumentId });
  try {
    await refreshUserConfigProjection(registry, tokenManager, userId, configDocument.id);
  } catch {
    // The SQL registry is the durable source of truth. A later profile load or
    // create can repair the derived user-config projection.
  }
  return {
    id: document.id,
    title: document.title,
  };
}
