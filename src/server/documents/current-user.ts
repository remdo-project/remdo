import type { YSweetDocumentTokenManager } from '#server/collab-token';
import type { DocumentKind } from '#server/db/schema';
import type { CurrentUserBootstrap, UserDocument } from '#domain/documents/user-data';
import type { SourceServer } from '#domain/source-servers';
import type { ServerAuth } from '#server/auth/auth';
import { reportServerDiagnostic } from '#server/diagnostics';
import {
  HOME_DOCUMENT_TITLE,
  USER_DATA_PROJECTION_TITLE,
} from '#domain/documents/special-documents';
import { syncSourceServersMapArray, syncUserDocumentsMapArray } from '#server/projection/user-data';
import { listDocumentAccessViewsForOwner } from './access';
import type { DocumentRegistry, RegisteredDocument } from './document-registry';
import { createUniqueNoteId } from '#domain/notes/ids';
import * as Y from 'yjs';

const USER_DATA_ROOT_NOTE_ID = 'user-data';
const DOCUMENTS_KEY = 'documents';
const SOURCE_SERVERS_KEY = 'source-servers';
const DOCUMENT_ID_ALLOCATION_ATTEMPTS = 64;

type UserSpecialDocumentKind = Exclude<DocumentKind, 'document'>;

interface CurrentUserBootstrapDocuments {
  userDataDocument: RegisteredDocument;
  homeDocument: RegisteredDocument;
}

function writeUserDataProjection(
  doc: Y.Doc,
  documents: readonly UserDocument[],
  sourceServers?: readonly SourceServer[],
): void {
  const root = doc.getMap<Y.Array<Y.Map<unknown>>>(USER_DATA_ROOT_NOTE_ID);
  const existing = root.get(DOCUMENTS_KEY);
  const userDocuments = existing instanceof Y.Array ? existing : new Y.Array<Y.Map<unknown>>();
  const existingSourceServers = root.get(SOURCE_SERVERS_KEY);
  const userSourceServers = existingSourceServers instanceof Y.Array
    ? existingSourceServers
    : new Y.Array<Y.Map<unknown>>();

  doc.transact(() => {
    if (!(existing instanceof Y.Array)) {
      root.set(DOCUMENTS_KEY, userDocuments);
    }
    syncUserDocumentsMapArray(userDocuments, documents);
    if (sourceServers) {
      if (!(existingSourceServers instanceof Y.Array)) {
        root.set(SOURCE_SERVERS_KEY, userSourceServers);
      }
      syncSourceServersMapArray(userSourceServers, sourceServers);
    }
  });
}

async function refreshUserDataProjection(
  registry: DocumentRegistry,
  tokenManager: YSweetDocumentTokenManager,
  userId: string,
  userDataDocumentId: string,
  {
    auth,
    sourceServers,
  }: {
    auth?: ServerAuth;
    sourceServers?: readonly SourceServer[];
  } = {},
): Promise<void> {
  await tokenManager.getOrCreateDocAndToken(userDataDocumentId, { authorization: 'read-only' });

  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, await tokenManager.getDocAsUpdate(userDataDocumentId));
    writeUserDataProjection(doc, await listProjectedUserDocuments(registry, userId, auth), sourceServers);
    await tokenManager.updateDoc(userDataDocumentId, Y.encodeStateAsUpdate(doc));
  } finally {
    doc.destroy();
  }
}

async function listProjectedUserDocuments(
  registry: DocumentRegistry,
  userId: string,
  auth?: ServerAuth,
): Promise<UserDocument[]> {
  const documents = await registry.listUserDocuments(userId);
  return Promise.all(documents.map(async (document) => ({
    id: document.id,
    shareable: auth !== undefined && document.kind === 'document' && document.ownerUserId === userId,
    title: document.title,
    ...(auth && document.kind === 'document' && document.ownerUserId === userId
      ? { access: await listDocumentAccessViewsForOwner(registry, auth, document.id, userId) }
      : {}),
  })));
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

async function refreshCurrentUserDocumentsProjection(
  registry: DocumentRegistry,
  tokenManager: YSweetDocumentTokenManager,
  userId: string,
  auth?: ServerAuth,
): Promise<void> {
  const { userDataDocument } = await ensureCurrentUserBootstrapDocuments(registry, userId);
  await refreshUserDataProjection(registry, tokenManager, userId, userDataDocument.id, { auth });
}

export async function refreshCurrentUserDocumentsProjectionBestEffort(
  registry: DocumentRegistry,
  tokenManager: YSweetDocumentTokenManager,
  userId: string,
  auth?: ServerAuth,
): Promise<void> {
  try {
    await refreshCurrentUserDocumentsProjection(registry, tokenManager, userId, auth);
  } catch {
    // SQL is the durable source of truth. A later bootstrap load or document
    // create can repair the derived user-data projection.
    reportServerDiagnostic('user-data-projection.refresh-failed');
  }
}

export async function ensureCurrentUserBootstrap(
  registry: DocumentRegistry,
  tokenManager: YSweetDocumentTokenManager,
  userId: string,
  {
    createDocumentId,
    sourceServers,
    auth,
  }: {
    auth?: ServerAuth;
    createDocumentId?: () => string;
    sourceServers?: readonly SourceServer[];
  } = {},
): Promise<CurrentUserBootstrap> {
  const { userDataDocument, homeDocument } = await ensureCurrentUserBootstrapDocuments(registry, userId, {
    createDocumentId,
  });

  await refreshUserDataProjection(registry, tokenManager, userId, userDataDocument.id, {
    auth,
    sourceServers,
  });

  return {
    userDataDocumentId: userDataDocument.id,
    homeDocumentId: homeDocument.id,
    publicServer: auth?.allowSignup ?? false,
  };
}

export async function createUserDocument(
  registry: DocumentRegistry,
  tokenManager: YSweetDocumentTokenManager,
  userId: string,
  title: string,
  { auth, createDocumentId }: { auth?: ServerAuth; createDocumentId?: () => string } = {},
): Promise<UserDocument> {
  await ensureCurrentUserBootstrapDocuments(registry, userId, { createDocumentId });
  const document = await createUserDocumentRecord(registry, userId, title, { createDocumentId });
  await refreshCurrentUserDocumentsProjectionBestEffort(registry, tokenManager, userId, auth);
  return {
    id: document.id,
    shareable: true,
    title: document.title,
  };
}
