import * as Y from 'yjs';
import { config } from '#config';
import { CollabSession } from '#lib/collaboration/session';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import type { CollaborationProviderInstance } from '#lib/collaboration/runtime';
import type { UserConfigNote } from './contracts';
import { DEFAULT_USER_DOCUMENT } from './defaults';
import {
  createUserConfigRootNote,
  resolveListedDocumentInsertIndex,
} from './user-config-notes';
import type { ListedDocument } from './user-config-notes';

const USER_CONFIG_DOC_ID = '__remdo_user_config__';
const USER_CONFIG_ROOT_NOTE_ID = 'user-config';
const DOCUMENTS_KEY = 'documents';

let userConfigPromise: Promise<UserConfigNote> | null = null;

export function getUserConfig(): Promise<UserConfigNote> {
  userConfigPromise ??= loadStoredUserConfig().catch((error) => {
    userConfigPromise = null;
    throw error;
  });
  return userConfigPromise;
}

async function loadStoredUserConfig(): Promise<UserConfigNote> {
  return withUserConfigDoc(async (doc, session) => {
    const root = doc.getMap<Y.Array<Y.Map<unknown>>>(USER_CONFIG_ROOT_NOTE_ID);
    const documents = ensureDocumentsArray(root);

    if (documents.length === 0) {
      documents.push([createDocumentEntry(DEFAULT_USER_DOCUMENT)]);
      await session.awaitSynced();
    }

    const listedDocuments = readUserConfigDocuments(root);
    return createUserConfigRootNote(listedDocuments, {
      createDocument: async (position, title) => {
        const document = { id: createUniqueNoteId(), title };

        await withUserConfigDoc(async (currentDoc, currentSession) => {
          const currentRoot = currentDoc.getMap<Y.Array<Y.Map<unknown>>>(USER_CONFIG_ROOT_NOTE_ID);
          const currentDocuments = ensureDocumentsArray(currentRoot);
          const insertIndex = resolveListedDocumentInsertIndex(readUserConfigDocuments(currentRoot), position);
          currentDocuments.insert(insertIndex, [createDocumentEntry(document)]);
          await currentSession.awaitSynced();
        });

        return document;
      },
    });
  });
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

async function withUserConfigDoc<T>(run: (doc: Y.Doc, session: CollabSession) => Promise<T>): Promise<T> {
  const origin = resolveCollabOrigin();
  const docMap = new Map<string, Y.Doc>();
  const session = new CollabSession({ enabled: true, docId: USER_CONFIG_DOC_ID, origin });
  session.attach(docMap);

  const attached = await waitForSessionAttachment(session, docMap, USER_CONFIG_DOC_ID);

  try {
    void attached.provider.connect();
    await session.awaitSynced();
    return await run(attached.doc, session);
  } finally {
    session.destroy();
    for (const current of docMap.values()) {
      current.destroy();
    }
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
