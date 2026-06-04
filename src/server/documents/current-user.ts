import type { DocumentTokenManager } from '@/server/collab-token';
import type { DocumentKind } from '@/server/db/schema';
import { syncUserDocumentsMapArray } from '@/server/yjs/projection';
import type { DocumentRegistry, RegisteredDocument } from './document-registry';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import { HOME_DOCUMENT_TITLE } from '@/documents/contracts';
import * as Y from 'yjs';

interface CurrentUserBootstrap {
  homeDocumentId: string;
  userDataDocumentId: string;
}

interface CreatedUserDocument {
  id: string;
  title: string;
}

const USER_DATA_ROOT_NOTE_ID = 'user-data';
const DOCUMENTS_KEY = 'documents';
const USER_DATA_PROJECTION_TITLE = 'User Data';
const DOCUMENT_ID_ALLOCATION_ATTEMPTS = 64;

type UserSpecialDocumentKind = Exclude<DocumentKind, 'document'>;

interface CurrentUserBootstrapDocuments {
  userDataDocument: RegisteredDocument;
  homeDocument: RegisteredDocument;
}

function writeUserDataProjection(
  doc: Y.Doc,
  documents: readonly Pick<RegisteredDocument, 'id' | 'title'>[],
): void {
  const root = doc.getMap<Y.Array<Y.Map<unknown>>>(USER_DATA_ROOT_NOTE_ID);
  const existing = root.get(DOCUMENTS_KEY);
  const userDocuments = existing instanceof Y.Array ? existing : new Y.Array<Y.Map<unknown>>();

  doc.transact(() => {
    if (!(existing instanceof Y.Array)) {
      root.set(DOCUMENTS_KEY, userDocuments);
    }
    syncUserDocumentsMapArray(userDocuments, documents);
  });
}

async function refreshUserDataProjection(
  registry: DocumentRegistry,
  tokenManager: DocumentTokenManager,
  userId: string,
  userDataDocumentId: string,
): Promise<void> {
  await tokenManager.getOrCreateDocAndToken(userDataDocumentId, { authorization: 'read-only' });

  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, await tokenManager.getDocAsUpdate(userDataDocumentId));
    writeUserDataProjection(doc, await registry.listUserDocuments(userId));
    await tokenManager.updateDoc(userDataDocumentId, Y.encodeStateAsUpdate(doc));
  } finally {
    doc.destroy();
  }
}

async function ensureUserDataDocument(
  registry: DocumentRegistry,
  userId: string,
  { createDocumentId }: { createDocumentId?: () => string },
): Promise<RegisteredDocument> {
  return ensureUserSpecialDocument(registry, userId, 'user-data-projection', USER_DATA_PROJECTION_TITLE, {
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

  return createUserDocumentRecord(registry, userId, title, {
    createDocumentId,
    kind,
  });
}

async function createUserDocumentRecord(
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

async function ensureCurrentUserBootstrapDocuments(
  registry: DocumentRegistry,
  userId: string,
  { createDocumentId }: { createDocumentId?: () => string } = {},
): Promise<CurrentUserBootstrapDocuments> {
  const userDataDocument = await ensureUserDataDocument(registry, userId, { createDocumentId });
  const homeDocument = await ensureUserHomeDocument(registry, userId, { createDocumentId });

  return { userDataDocument, homeDocument };
}

export async function refreshCurrentUserDocumentsProjection(
  registry: DocumentRegistry,
  tokenManager: DocumentTokenManager,
  userId: string,
): Promise<void> {
  const { userDataDocument } = await ensureCurrentUserBootstrapDocuments(registry, userId);
  await refreshUserDataProjection(registry, tokenManager, userId, userDataDocument.id);
}

export async function ensureCurrentUserBootstrap(
  registry: DocumentRegistry,
  tokenManager: DocumentTokenManager,
  userId: string,
  { createDocumentId }: { createDocumentId?: () => string } = {},
): Promise<CurrentUserBootstrap> {
  const { userDataDocument, homeDocument } = await ensureCurrentUserBootstrapDocuments(registry, userId, {
    createDocumentId,
  });

  await refreshUserDataProjection(registry, tokenManager, userId, userDataDocument.id);

  return {
    userDataDocumentId: userDataDocument.id,
    homeDocumentId: homeDocument.id,
  };
}

export async function createUserDocument(
  registry: DocumentRegistry,
  tokenManager: DocumentTokenManager,
  userId: string,
  title: string,
  { createDocumentId }: { createDocumentId?: () => string } = {},
): Promise<CreatedUserDocument> {
  const { userDataDocument } = await ensureCurrentUserBootstrapDocuments(registry, userId, { createDocumentId });
  const document = await createUserDocumentRecord(registry, userId, title, { createDocumentId });
  try {
    await refreshUserDataProjection(registry, tokenManager, userId, userDataDocument.id);
  } catch {
    // The SQL registry is the durable source of truth. A later bootstrap load or
    // create can repair the derived user-data projection.
  }
  return {
    id: document.id,
    title: document.title,
  };
}
