import * as Y from 'yjs';
import { CollabSession } from '#lib/collaboration/session';
import { resolveApiServerOrigin, resolveAppOrigin } from '#lib/net/origins';
import type { CollaborationProviderInstance } from '#lib/collaboration/runtime';
import { getCurrentUserBootstrap } from './current-user-bootstrap';
import type { CurrentUserBootstrap } from './current-user-bootstrap';
import { normalizeDocumentId } from '@/domain/documents/ids';
import { HOME_DOCUMENT_TITLE } from '@/domain/documents/special-documents';
import { createUserDataRootNote } from '@/note-sdk';
import type { UserDataNote, UserDocument } from '@/note-sdk';

const USER_DATA_ROOT_NOTE_ID = 'user-data';
const DOCUMENTS_KEY = 'documents';
const STARTUP_RETRY_DELAY_MS = 1000;

interface UserDataStoreContext {
  session: CollabSession;
  doc: Y.Doc;
  unobserveProjection?: () => void;
}

function createHomeUserDocument(bootstrap: CurrentUserBootstrap): UserDocument {
  return { id: bootstrap.homeDocumentId, title: HOME_DOCUMENT_TITLE };
}

// Tab-scoped store that keeps the live user-data session outside route/component lifecycles.
class StoredUserDataStore {
  private listeners = new Set<() => void>();
  private homeDocumentId: string | null = null;
  private documents: UserDocument[] = [];
  private readonly userData = createUserDataRootNote(this.documents, {
    createDocument: async (title) => this.createDocument(title),
    homeDocumentId: () => this.homeDocumentId,
  });
  private context: UserDataStoreContext | null = null;
  private contextPromise: Promise<UserDataStoreContext> | null = null;
  private pendingContextSession: CollabSession | null = null;
  private readyPromise: Promise<void> | null = null;
  private startupRetryHandle: ReturnType<typeof setTimeout> | null = null;
  private ready = false;
  private version = 0;
  private generation = 0;

  start(): void {
    const generation = this.generation;
    void this.ensureReady(generation).catch(() => {
      if (this.generation === generation) {
        this.scheduleStartupRetry();
      }
    });
  }

  reset(): void {
    this.generation += 1;
    if (this.startupRetryHandle) {
      clearTimeout(this.startupRetryHandle);
      this.startupRetryHandle = null;
    }
    if (this.pendingContextSession) {
      this.pendingContextSession.destroy();
      this.pendingContextSession = null;
    }
    if (this.context) {
      destroyUserDataStoreContext(this.context);
      this.context = null;
    }
    this.contextPromise = null;
    this.readyPromise = null;
    this.ready = false;
    this.homeDocumentId = null;
    this.replaceDocuments([]);
    this.bumpVersion();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getCurrentUserData(): UserDataNote {
    return this.userData;
  }

  getUserData(): Promise<UserDataNote> {
    return this.ensureReady().then(() => this.userData);
  }

  getVersion(): number {
    return this.version;
  }

  private async ensureReady(generation = this.generation): Promise<void> {
    if (this.ready) {
      return;
    }
    if (!this.readyPromise) {
      const readyPromise = this.loadUserData(generation)
        .then(() => {
          if (this.readyPromise === readyPromise && this.generation === generation) {
            this.ready = true;
            this.readyPromise = null;
            if (this.startupRetryHandle) {
              clearTimeout(this.startupRetryHandle);
              this.startupRetryHandle = null;
            }
            this.bumpVersion();
          }
        })
        .catch((error) => {
          if (this.readyPromise === readyPromise && this.generation === generation) {
            this.readyPromise = null;
          }
          throw error;
        });
      this.readyPromise = readyPromise;
    }
    return this.readyPromise;
  }

  private async loadUserData(generation: number): Promise<void> {
    const bootstrap = await getCurrentUserBootstrap();
    if (this.generation !== generation) {
      return;
    }
    const homeDocument = createHomeUserDocument(bootstrap);
    const context = await this.getContext(bootstrap.userDataDocumentId, generation);
    if (this.generation === generation) {
      this.homeDocumentId = bootstrap.homeDocumentId;
      context.unobserveProjection?.();
      context.unobserveProjection = this.observeUserDataProjection(context.doc, generation);
      this.syncDocumentsFromProjection(context.doc, homeDocument);
    }
  }

  private async createDocument(title: string) {
    await this.ensureReady();
    const document = await createUserDocument(title);
    return document;
  }

  private async getContext(userDataDocumentId: string, generation: number): Promise<UserDataStoreContext> {
    if (this.context) {
      return this.context;
    }
    if (!this.contextPromise) {
      const contextPromise = createUserDataStoreContext(userDataDocumentId, (session) => {
        if (this.generation === generation) {
          this.pendingContextSession = session;
        } else {
          session.destroy();
        }
      })
        .then((context) => {
          if (this.contextPromise === contextPromise && this.generation === generation) {
            if (this.pendingContextSession === context.session) {
              this.pendingContextSession = null;
            }
            this.context = context;
          } else {
            if (this.pendingContextSession === context.session) {
              this.pendingContextSession = null;
              destroyUserDataStoreContext(context);
            }
            throw new Error('User data runtime was reset.');
          }
          return context;
        })
        .catch((error) => {
          if (this.contextPromise === contextPromise && this.generation === generation) {
            this.contextPromise = null;
            this.pendingContextSession = null;
          }
          throw error;
        });
      this.contextPromise = contextPromise;
    }
    return this.contextPromise;
  }

  private replaceDocuments(nextDocuments: readonly UserDocument[]) {
    if (areUserDocumentsEqual(this.documents, nextDocuments)) {
      return false;
    }
    this.documents.splice(0, this.documents.length, ...nextDocuments);
    return true;
  }

  private observeUserDataProjection(doc: Y.Doc, generation: number): () => void {
    const handleUpdate = () => {
      if (this.generation !== generation) {
        return;
      }
      if (this.syncDocumentsFromProjection(doc)) {
        this.bumpVersion();
      }
    };
    doc.on('update', handleUpdate);
    return () => doc.off('update', handleUpdate);
  }

  private syncDocumentsFromProjection(doc: Y.Doc, fallbackDocument = this.createFallbackHomeDocument()): boolean {
    const root = doc.getMap<Y.Array<Y.Map<unknown>>>(USER_DATA_ROOT_NOTE_ID);
    const documents = readUserDataDocuments(root);
    return this.replaceDocuments(documents.length > 0 ? documents : fallbackDocument ? [fallbackDocument] : []);
  }

  private createFallbackHomeDocument(): UserDocument | null {
    return this.homeDocumentId ? { id: this.homeDocumentId, title: HOME_DOCUMENT_TITLE } : null;
  }

  private scheduleStartupRetry() {
    if (this.ready || this.readyPromise || this.startupRetryHandle) {
      return;
    }
    this.startupRetryHandle = setTimeout(() => {
      this.startupRetryHandle = null;
      this.start();
    }, STARTUP_RETRY_DELAY_MS);
  }

  private bumpVersion() {
    this.version += 1;
    this.notifyListeners();
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function areUserDocumentsEqual(
  currentDocuments: readonly UserDocument[],
  nextDocuments: readonly UserDocument[],
): boolean {
  return currentDocuments.length === nextDocuments.length
    && currentDocuments.every((document, index) => {
      const nextDocument = nextDocuments[index];
      return nextDocument?.id === document.id && nextDocument.title === document.title;
    });
}

function destroyUserDataStoreContext(context: UserDataStoreContext): void {
  context.unobserveProjection?.();
  context.session.destroy();
}

function readUserDataDocuments(root: Y.Map<Y.Array<Y.Map<unknown>>>) {
  const documents = root.get(DOCUMENTS_KEY);
  if (!(documents instanceof Y.Array)) {
    return [];
  }

  return documents.toArray().map((value) => {
    if (!(value instanceof Y.Map)) {
      throw new TypeError('User data documents list contains an invalid entry.');
    }
    const id = value.get('id');
    const title = value.get('title');
    if (typeof id !== 'string' || typeof title !== 'string') {
      throw new TypeError('User data document entry is missing id or title.');
    }
    return { id, title };
  });
}

async function createUserDocument(title: string): Promise<UserDocument> {
  const response = await fetch('/api/documents', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create document: ${response.status}`);
  }

  const body = await response.json() as Partial<UserDocument>;
  const id = normalizeDocumentId(body.id);
  if (!id || typeof body.title !== 'string') {
    throw new TypeError('Document creation returned an invalid document.');
  }
  return { id, title: body.title };
}

async function createUserDataStoreContext(
  docId: string,
  onSessionCreated: (session: CollabSession) => void,
): Promise<UserDataStoreContext> {
  const origin = resolveCollabOrigin();
  const apiOrigin = resolveCollabApiOrigin();
  const docMap = new Map<string, Y.Doc>();
  const session = new CollabSession({ enabled: true, docId, origin, apiOrigin });
  onSessionCreated(session);
  try {
    session.attach(docMap);

    const attached = await waitForSessionAttachment(session, docMap, docId);

    void attached.provider.connect();
    await session.awaitSynced();
    return {
      session,
      doc: attached.doc,
    };
  } catch (error) {
    session.destroy();
    throw error;
  }
}

async function waitForSessionAttachment(
  session: CollabSession,
  docMap: Map<string, Y.Doc>,
  docId: string,
  timeoutMs = 5000,
): Promise<{ provider: CollaborationProviderInstance; doc: Y.Doc }> {
  const resolveAttachment = () => {
    const provider = session.getProvider();
    const doc = docMap.get(docId);
    if (!provider || !doc) {
      return null;
    }
    return { provider, doc };
  };

  const immediate = resolveAttachment();
  if (immediate) {
    return immediate;
  }

  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeoutHandle = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for collaboration provider for ${docId}`));
    }, timeoutMs);

    const onUpdate = () => {
      const attached = resolveAttachment();
      if (!attached) {
        return;
      }
      clearTimeout(timeoutHandle);
      unsubscribe();
      resolve(attached);
    };

    unsubscribe = session.subscribe(onUpdate);
    onUpdate();
  });
}

function resolveCollabOrigin(): string {
  if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') {
    return location.origin;
  }
  return resolveAppOrigin({ loopback: true });
}

function resolveCollabApiOrigin(): string {
  if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') {
    return location.origin;
  }
  return resolveApiServerOrigin({ loopback: true });
}

const store = new StoredUserDataStore();

export function startUserDataRuntime(): void {
  store.start();
}

export function resetUserDataRuntime(): void {
  store.reset();
}

export function subscribeUserDataRuntime(listener: () => void) {
  return store.subscribe(listener);
}

export function getCurrentUserData(): UserDataNote {
  return store.getCurrentUserData();
}

export function getUserData(): Promise<UserDataNote> {
  return store.getUserData();
}

export function getUserDataVersion(): number {
  return store.getVersion();
}
