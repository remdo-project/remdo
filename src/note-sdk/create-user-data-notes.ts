import type { DocumentAccessView, DocumentContactView } from '#domain/documents/access';
import type { UserDocument } from '#domain/documents/user-data';
import type {
  DocumentSourceNote,
  DocumentNote,
  UserDataNote,
  UserDocumentsNote,
} from './documents';
import type { CollectionNote, Note, NoteId } from './notes';
import { createNoteAs } from './handle-utils';
import { NoteUnavailableError } from './note-unavailable-error';
import { createDocumentNote } from './create-document-note';

const USER_DATA_ROOT_ID = 'user-data';
const USER_DOCUMENT_SOURCES_ID = 'document-sources';
const LOCAL_DOCUMENT_SOURCE_ID = 'local';
const USER_DOCUMENTS_ID = 'user-documents';
const USER_DATA_TITLE = 'User Data';
const USER_DOCUMENT_SOURCES_TITLE = 'Document Sources';
const USER_DOCUMENTS_TITLE = 'Documents';

interface UserDataNoteActions {
  createDocument?: (title: string) => Promise<UserDocument>;
  deleteDocument?: (documentId: NoteId) => Promise<void>;
  documentSources?: CollectionSource<DocumentSource>;
  renameDocument?: (documentId: NoteId, title: string) => Promise<unknown>;
  shareDocument?: (documentId: NoteId, email: string) => Promise<DocumentAccessView>;
}

export interface DocumentSource {
  baseUrl: string | null;
  documents: CollectionSource<UserDocument>;
  id: NoteId;
  label: string;
  local: boolean;
}

export interface CollectionSource<Item extends { id: NoteId }> {
  getChildren: () => readonly Item[];
  getById: (itemId: NoteId) => Item | null;
  /** Notifies when items may have changed; omitted by a source that never changes. */
  subscribe?: (listener: () => void) => () => void;
}

type CollectionSourceInput<Item extends { id: NoteId }> = readonly Item[] | CollectionSource<Item>;

function createArrayCollectionSource<Item extends { id: NoteId }>(items: readonly Item[]): CollectionSource<Item> {
  return {
    getChildren: () => items,
    getById: (itemId) => items.find((item) => item.id === itemId) ?? null,
  };
}

function isCollectionSource<Item extends { id: NoteId }>(value: unknown): value is CollectionSource<Item> {
  return typeof value === 'object'
    && value !== null
    && 'getChildren' in value
    && typeof value.getChildren === 'function'
    && 'getById' in value
    && typeof value.getById === 'function';
}

function resolveCollectionSource<Item extends { id: NoteId }>(
  input: CollectionSourceInput<Item>,
): CollectionSource<Item> {
  if (isCollectionSource<Item>(input)) {
    return input;
  }
  return createArrayCollectionSource(input);
}

function documentAccessSource(access: DocumentAccessView) {
  return {
    getId: () => `${access.documentId}/access/${encodeURIComponent(access.granteeUserId)}`,
    getText: () => access.name || access.email,
    getEmail: () => access.email,
    getGranteeUserId: () => access.granteeUserId,
    getName: () => access.name,
  };
}

const unsubscribeNothing = () => {};

function sharingSuggestions(document: UserDocument, documents: readonly UserDocument[]): DocumentContactView[] {
  if (!document.shareable) return [];
  const existing = new Set((document.access ?? []).map((access) => access.granteeUserId));
  const contacts = new Map<string, { contact: DocumentContactView; outgoing: boolean }>();
  for (const candidate of documents) {
    if (candidate.shareable) {
      for (const access of candidate.access ?? []) {
        const contact = { userId: access.granteeUserId, email: access.email, name: access.name };
        if (!existing.has(contact.userId)) contacts.set(contact.userId, { contact, outgoing: true });
      }
    } else if (candidate.sharedBy && !existing.has(candidate.sharedBy.userId) && !contacts.has(candidate.sharedBy.userId)) {
      contacts.set(candidate.sharedBy.userId, { contact: candidate.sharedBy, outgoing: false });
    }
  }
  return [...contacts.values()].sort((a, b) => (
    Number(b.outgoing) - Number(a.outgoing)
    || (a.contact.name || a.contact.email).localeCompare(b.contact.name || b.contact.email)
    || a.contact.email.localeCompare(b.contact.email)
  )).map(({ contact }) => contact);
}

function createDocumentHandle(
  noteId: NoteId,
  documents: Required<CollectionSource<UserDocument>>,
  getActions: () => UserDataNoteActions,
  parent: () => CollectionNote<DocumentNote>,
): DocumentNote {
  const read = () => {
    const document = documents.getById(noteId);
    if (!document) throw new NoteUnavailableError(noteId);
    return document;
  };
  const { subscribe } = documents;
  const grants = () => (read().access ?? []).map(documentAccessSource);
  const access = {
    getChildren: grants,
    getById: (id: string) => grants().find(grant => grant.getId() === id) ?? null,
  };

  async function shareWith(email: string) {
    const actions = getActions();
    if (!actions.shareDocument) {
      throw new Error('Document sharing is not available for this document.');
    }
    if (typeof email !== 'string') {
      throw new TypeError('document.shareWith(email) requires a user email.');
    }
    return documentAccessSource(await actions.shareDocument(noteId, email));
  }

  async function rename(title: string): Promise<void> {
    const actions = getActions();
    if (!actions.renameDocument) {
      throw new Error('Renaming is not available for this document.');
    }
    if (typeof title !== 'string') {
      throw new TypeError('document.rename(title) requires a document title.');
    }
    await actions.renameDocument(noteId, title);
  }

  async function deleteDocument(): Promise<void> {
    const actions = getActions();
    if (!actions.deleteDocument) {
      throw new Error('Deletion is not available for this document.');
    }
    await actions.deleteDocument(noteId);
  }

  return createDocumentNote(noteId, {
    metadata: {
      getParent: parent,
      getText: () => read().title,
      access,
      getSharingSuggestions: () => sharingSuggestions(read(), documents.getChildren()),
      canShareWith: () => eligible(() => Boolean(getActions().shareDocument) && documents.getById(noteId)?.shareable === true),
      shareWith,
      canRename: () => eligible(() => Boolean(getActions().renameDocument) && documents.getById(noteId) !== null),
      rename,
      canDelete: () => eligible(() => Boolean(getActions().deleteDocument) && documents.getById(noteId)?.deletable === true),
      delete: deleteDocument,
      subscribe,
    },
  });
}

function createCollectionHandle<Item extends { id: NoteId }, ItemNote extends Note, Parent extends Note | null>({
  createItemNote,
  items,
  noteId,
  text,
  parent,
}: {
  createItemNote: (item: Item) => ItemNote;
  items: CollectionSource<Item>;
  noteId: NoteId;
  text: string;
  parent: () => Parent;
}): CollectionNote<ItemNote> & { getParent: () => Parent } {
  const kind = () => 'collection' as const;
  const handle: CollectionNote<ItemNote> & { getParent: () => Parent } = {
    getId: () => noteId,
    getKind: kind,
    getText: () => text,
    getParent: parent,
    getChildren: () => items.getChildren().map((item) => createItemNote(item)),
    getById: (itemId) => {
      const item = items.getById(itemId);
      return item ? createItemNote(item) : null;
    },
    subscribe: (listener) => items.subscribe?.(listener) ?? unsubscribeNothing,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function eligible(read: () => boolean): boolean {
  try { return read(); } catch (error) {
    if (error instanceof NoteUnavailableError) return false;
    throw error;
  }
}

export function createUserDataRootNote(
  documents: CollectionSourceInput<UserDocument>,
  actions: UserDataNoteActions = {},
): UserDataNote {
  const noteId = USER_DATA_ROOT_ID;
  const kind = () => 'user-data' as const;
  const localDocuments = resolveCollectionSource(documents);
  const sources = actions.documentSources ?? createArrayCollectionSource([{
    baseUrl: null,
    documents: localDocuments,
    id: LOCAL_DOCUMENT_SOURCE_ID,
    label: 'Current Server',
    local: true,
  }]);
  const sourceRefs = new Map<NoteId, DocumentSourceNote>();
  const documentRefs = new Map<NoteId, DocumentNote>();

  function readSource(sourceId: NoteId): DocumentSource {
    const source = sources.getById(sourceId);
    if (!source) throw new NoteUnavailableError(sourceId);
    return source;
  }

  function sourceFor(documentId: NoteId): DocumentSource | null {
    for (const source of sources.getChildren()) {
      if (source.documents.getById(documentId)) {
        return source;
      }
    }
    return null;
  }

  function requireSourceFor(documentId: NoteId): DocumentSource {
    const source = sourceFor(documentId);
    if (!source) throw new NoteUnavailableError(documentId);
    return source;
  }

  // Discover subscriptions without requiring inventories to be readable. Their
  // existing subscriptions still deliver failure and recovery notifications.
  function observeSources(listener: () => void): () => void {
    const subscriptions = new Map<CollectionSource<UserDocument>, () => void>();
    const state = { released: false, refreshing: false, refreshPending: false };
    const active = () => !state.released;
    const refreshPending = () => state.refreshPending;
    const notify = () => { if (!state.released) listener(); };
    function refresh() {
      if (!active()) return;
      if (state.refreshing) { state.refreshPending = true; return; }
      state.refreshing = true;
      try {
        do {
          state.refreshPending = false;
          let current: readonly DocumentSource[];
          try {
            current = sources.getChildren();
          } catch (error) {
            if (error instanceof NoteUnavailableError) return;
            throw error;
          }
          const desired = new Set(current.map(source => source.documents));
          for (const [source, stop] of subscriptions) {
            if (desired.has(source)) continue;
            stop();
            subscriptions.delete(source);
          }
          for (const source of desired) {
            if (!active()) break;
            if (!subscriptions.has(source)) {
              const stop = source.subscribe?.(notify) ?? unsubscribeNothing;
              if (!active()) stop();
              else subscriptions.set(source, stop);
            }
          }
        } while (refreshPending() && active());
      } finally { state.refreshing = false; }
    }
    const stopSources = sources.subscribe?.(() => { refresh(); notify(); }) ?? unsubscribeNothing;
    function unsubscribe() {
      if (state.released) return;
      state.released = true;
      stopSources();
      for (const stop of subscriptions.values()) stop();
      subscriptions.clear();
    }
    try { refresh(); } catch (error) { unsubscribe(); throw error; }
    return unsubscribe;
  }

  function documentRef(documentId: NoteId): DocumentNote {
    const retained = documentRefs.get(documentId);
    if (retained) return retained;
    const document = createDocumentHandle(documentId, {
      getChildren: () => requireSourceFor(documentId).documents.getChildren(),
      getById: id => sourceFor(documentId)?.documents.getById(id) ?? null,
      subscribe: observeSources,
    }, () => {
      if (!actions.documentSources) return actions;
      return requireSourceFor(documentId).local ? actions : {};
    }, () => sourceRef(requireSourceFor(documentId).id).documents);
    documentRefs.set(documentId, document);
    return document;
  }

  function sourceRef(sourceId: NoteId): DocumentSourceNote {
    const retained = sourceRefs.get(sourceId);
    if (retained) return retained;
    const read = () => readSource(sourceId);
    const sourceKind = () => 'document-source' as const;
    const sourceDocuments = createCollectionHandle({
      noteId: `${sourceId}/documents`,
      text: USER_DOCUMENTS_TITLE,
      parent: sourceParent,
      items: {
        getChildren: () => read().documents.getChildren(),
        getById: id => read().documents.getById(id),
        subscribe: observeSources,
      },
      createItemNote: document => documentRef(document.id),
    });
    const source: DocumentSourceNote = {
      getId: () => sourceId,
      getKind: sourceKind,
      getText: () => read().label,
      getParent: () => { read(); return sourcesParent(); },
      getChildren: () => { read(); return [sourceDocuments]; },
      documents: sourceDocuments,
      getBaseUrl: () => read().baseUrl,
      getLocal: () => read().local,
      as: createNoteAs(sourceId, sourceKind, () => source),
    };
    function sourceParent() { read(); return source; }
    sourceRefs.set(sourceId, source);
    return source;
  }

  const sourceCollection = createCollectionHandle({
    noteId: USER_DOCUMENT_SOURCES_ID,
    text: USER_DOCUMENT_SOURCES_TITLE,
    parent: userDataRef,
    items: sources,
    createItemNote: source => sourceRef(source.id),
  });
  function sourcesParent() { return sourceCollection; }
  const collectionKind = () => 'collection' as const;
  const userDocuments: UserDocumentsNote = {
    getId: () => USER_DOCUMENTS_ID,
    getKind: collectionKind,
    getText: () => USER_DOCUMENTS_TITLE,
    getParent: userDataRef,
    getChildren: () => sourceCollection.getChildren().flatMap(source => source.documents.getChildren()),
    getById: documentId => (sourceFor(documentId) ? documentRef(documentId) : null),
    create: async text => {
      if (!actions.createDocument) {
        throw new Error('Document creation is not available for this user data.');
      }
      if (typeof text !== 'string') {
        throw new TypeError('documents.create(text) requires a document title.');
      }
      const created = await actions.createDocument(text);
      return documentRef(created.id);
    },
    subscribe: observeSources,
    as: createNoteAs(USER_DOCUMENTS_ID, collectionKind, () => userDocuments),
  };
  const handle: UserDataNote = {
    getId: () => noteId,
    getKind: kind,
    getText: () => USER_DATA_TITLE,
    getParent: () => null,
    getChildren: () => [sourceCollection, userDocuments],
    sources: sourceCollection,
    documents: userDocuments,
    documentRef,
    as: createNoteAs(noteId, kind, () => handle),
  };
  function userDataRef() { return handle; }
  return handle;
}
