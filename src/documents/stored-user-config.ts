import * as Y from 'yjs';
import { config } from '#config';
import { CollabSession } from '#lib/collaboration/session';
import type { CollaborationProviderInstance } from '#lib/collaboration/runtime';
import type { UserConfigNote } from './contracts';
import { HOME_DOCUMENT_TITLE } from './contracts';
import { getUserProfile } from './user-profile';
import type { UserProfile } from './user-profile';
import { createUserConfigRootNote } from './user-config-notes';
import type { ListedDocument } from './user-config-notes';
import { normalizeDocumentId } from '@/routing';

const USER_CONFIG_ROOT_NOTE_ID = 'user-config';
const DOCUMENTS_KEY = 'documents';
const STARTUP_RETRY_DELAY_MS = 1000;

interface StoredUserConfigContext {
  session: CollabSession;
  doc: Y.Doc;
}

function createHomeUserDocument(profile: UserProfile): ListedDocument {
  return { id: profile.homeDocumentId, title: HOME_DOCUMENT_TITLE };
}

// Tab-scoped store that keeps the live user-config session outside route/component lifecycles.
class StoredUserConfigStore {
  private listeners = new Set<() => void>();
  private documents: ListedDocument[] = [];
  private readonly userConfig = createUserConfigRootNote(this.documents, {
    createDocument: async (title) => this.createDocument(title),
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
    const profile = await getUserProfile();
    const homeDocument = createHomeUserDocument(profile);
    const context = await this.getContext(profile.configDocumentId);
    const root = context.doc.getMap<Y.Array<Y.Map<unknown>>>(USER_CONFIG_ROOT_NOTE_ID);
    const documents = readUserConfigDocuments(root);
    this.replaceDocuments(documents.length > 0 ? documents : [homeDocument]);
  }

  private async createDocument(title: string) {
    await this.ensureReady();
    const document = await createListedDocument(title);
    return document;
  }

  private async getContext(configDocumentId: string): Promise<StoredUserConfigContext> {
    if (this.context) {
      return this.context;
    }
    if (!this.contextPromise) {
      const contextPromise = createStoredUserConfigContext(configDocumentId)
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

function readUserConfigDocuments(root: Y.Map<Y.Array<Y.Map<unknown>>>) {
  const documents = root.get(DOCUMENTS_KEY);
  if (!(documents instanceof Y.Array)) {
    return [];
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

async function createListedDocument(title: string): Promise<ListedDocument> {
  const response = await fetch('/api/profile/documents', {
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

  const body = await response.json() as Partial<ListedDocument>;
  const id = normalizeDocumentId(body.id);
  if (!id || typeof body.title !== 'string') {
    throw new TypeError('Document creation returned an invalid document.');
  }
  return { id, title: body.title };
}

async function createStoredUserConfigContext(docId: string): Promise<StoredUserConfigContext> {
  const origin = resolveCollabOrigin();
  const apiOrigin = resolveCollabApiOrigin();
  const docMap = new Map<string, Y.Doc>();
  const session = new CollabSession({ enabled: true, docId, origin, apiOrigin });
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
  return `http://${config.env.HOST}:${config.env.PORT}`;
}

function resolveCollabApiOrigin(): string {
  if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') {
    return location.origin;
  }
  return `http://${config.env.HOST}:${config.env.REMDO_API_PORT}`;
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
