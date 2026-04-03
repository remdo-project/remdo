import * as Y from 'yjs';
import { config } from '#config';
import { CollabSession } from '#lib/collaboration/session';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import type { CollaborationProviderInstance } from '#lib/collaboration/runtime';
import type { UserConfigNote } from './contracts';
import { DEFAULT_USER_DOCUMENT } from './defaults';
import { getUserConfigDocId } from './user-config-doc-id';
import {
  createUserConfigRootNote,
  resolveListedDocumentInsertIndex,
} from './user-config-notes';
import type { ListedDocument } from './user-config-notes';

const USER_CONFIG_ROOT_NOTE_ID = 'user-config';
const DOCUMENTS_KEY = 'documents';
const STARTUP_RETRY_DELAY_MS = 1000;

interface StoredUserConfigContext {
  session: CollabSession;
  doc: Y.Doc;
}

// Tab-scoped store that keeps the live user-config session outside route/component lifecycles.
class StoredUserConfigStore {
  private listeners = new Set<() => void>();
  private documents: ListedDocument[] = [DEFAULT_USER_DOCUMENT];
  private readonly userConfig = createUserConfigRootNote(this.documents, {
    createDocument: async (position, title) => this.createDocument(position, title),
    onChange: () => this.bumpVersion(),
  });
  private context: StoredUserConfigContext | null = null;
  private contextPromise: Promise<StoredUserConfigContext> | null = null;
  private readyPromise: Promise<void> | null = null;
  private startupRetryHandle: ReturnType<typeof setTimeout> | null = null;
  private ready = false;
  private version = 0;

  start(): void {
    void this.ensureReady().catch(() => {
      this.scheduleStartupRetry();
    });
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getCurrentUserConfig(): UserConfigNote {
    return this.userConfig;
  }

  getUserConfig(): Promise<UserConfigNote> {
    return this.ensureReady().then(() => this.userConfig);
  }

  getVersion(): number {
    return this.version;
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) {
      return;
    }
    if (!this.readyPromise) {
      const readyPromise = this.loadUserConfig()
        .then(() => {
          if (this.readyPromise === readyPromise) {
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
          if (this.readyPromise === readyPromise) {
            this.readyPromise = null;
          }
          throw error;
        });
      this.readyPromise = readyPromise;
    }
    return this.readyPromise;
  }

  private async loadUserConfig(): Promise<void> {
    const context = await this.getContext();
    const root = context.doc.getMap<Y.Array<Y.Map<unknown>>>(USER_CONFIG_ROOT_NOTE_ID);
    const documents = ensureDocumentsArray(root);

    if (documents.length === 0) {
      documents.push([createDocumentEntry(DEFAULT_USER_DOCUMENT)]);
      await this.awaitContextSync(context);
    }

    this.replaceDocuments(readUserConfigDocuments(root));
  }

  private async createDocument(position: Parameters<typeof resolveListedDocumentInsertIndex>[1], title: string) {
    const context = await this.getContext();
    const root = context.doc.getMap<Y.Array<Y.Map<unknown>>>(USER_CONFIG_ROOT_NOTE_ID);
    const documents = ensureDocumentsArray(root);
    const listedDocuments = readUserConfigDocuments(root);
    this.replaceDocuments(listedDocuments);

    const document = { id: createUniqueNoteId(), title };
    const insertIndex = resolveListedDocumentInsertIndex(listedDocuments, position);
    documents.insert(insertIndex, [createDocumentEntry(document)]);
    await this.awaitContextSync(context);
    this.ready = true;
    return document;
  }

  private async getContext(): Promise<StoredUserConfigContext> {
    if (this.context) {
      return this.context;
    }
    if (!this.contextPromise) {
      const contextPromise = createStoredUserConfigContext()
        .then((context) => {
          if (this.contextPromise === contextPromise) {
            this.context = context;
          }
          return context;
        })
        .catch((error) => {
          if (this.contextPromise === contextPromise) {
            this.contextPromise = null;
          }
          throw error;
        });
      this.contextPromise = contextPromise;
    }
    return this.contextPromise;
  }

  private async awaitContextSync(context: StoredUserConfigContext): Promise<void> {
    try {
      await context.session.awaitSynced();
    } catch (error) {
      this.resetContext(context);
      throw error;
    }
  }

  private replaceDocuments(nextDocuments: readonly ListedDocument[]) {
    this.documents.splice(0, this.documents.length, ...nextDocuments);
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

  private resetContext(context: StoredUserConfigContext) {
    if (this.context === context) {
      this.context = null;
      this.contextPromise = null;
      this.ready = false;
    }
    context.session.destroy();
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

function ensureDocumentsArray(root: Y.Map<Y.Array<Y.Map<unknown>>>): Y.Array<Y.Map<unknown>> {
  const existing = root.get(DOCUMENTS_KEY);
  if (existing instanceof Y.Array) {
    return existing;
  }
  const documents = new Y.Array<Y.Map<unknown>>();
  documents.push([createDocumentEntry(DEFAULT_USER_DOCUMENT)]);
  root.set(DOCUMENTS_KEY, documents);
  return documents;
}

function createDocumentEntry(document: ListedDocument): Y.Map<unknown> {
  const entry = new Y.Map<unknown>();
  entry.set('id', document.id);
  entry.set('title', document.title);
  return entry;
}

function readUserConfigDocuments(root: Y.Map<Y.Array<Y.Map<unknown>>>) {
  const documents = root.get(DOCUMENTS_KEY);
  if (!(documents instanceof Y.Array)) {
    throw new TypeError('User-config document is missing the documents list.');
  }

  return documents.toArray().map((value) => {
    if (!(value instanceof Y.Map)) {
      throw new TypeError('User-config documents list contains an invalid entry.');
    }
    const id = value.get('id');
    const title = value.get('title');
    if (typeof id !== 'string' || typeof title !== 'string') {
      throw new TypeError('User-config document entry is missing id or title.');
    }
    return { id, title };
  });
}

async function createStoredUserConfigContext(): Promise<StoredUserConfigContext> {
  const docId = getUserConfigDocId();
  const origin = resolveCollabOrigin();
  const docMap = new Map<string, Y.Doc>();
  const session = new CollabSession({ enabled: true, docId, origin });
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
  return `http://${config.env.HOST}:${config.env.COLLAB_SERVER_PORT}`;
}

const store = new StoredUserConfigStore();

export function startUserConfigRuntime(): void {
  store.start();
}

export function subscribeUserConfigRuntime(listener: () => void) {
  return store.subscribe(listener);
}

export function getCurrentUserConfig(): UserConfigNote {
  return store.getCurrentUserConfig();
}

export function getUserConfig(): Promise<UserConfigNote> {
  return store.getUserConfig();
}

export function getUserConfigVersion(): number {
  return store.getVersion();
}
