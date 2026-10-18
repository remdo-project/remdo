import type { DocumentAccessView, DocumentContactView } from '#domain/documents/access';
import type { UserDocument } from '#domain/documents/user-data';
import type {
  DocumentSourceNote,
  DocumentSourcesNote,
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
  documents: CollectionSource<UserDocument>,
  actions: UserDataNoteActions,
): DocumentNote {
  const read = () => {
    const document = documents.getById(noteId);
    if (!document) throw new NoteUnavailableError(noteId);
    return document;
  };
  const subscribe = (listener: () => void) => documents.subscribe?.(listener) ?? unsubscribeNothing;
  const grants = () => (read().access ?? []).map(documentAccessSource);
  const access = {
    getChildren: grants,
    getById: (id: string) => grants().find(grant => grant.getId() === id) ?? null,
  };

  async function shareWith(email: string) {
    if (!actions.shareDocument) {
      throw new Error('Document sharing is not available for this document.');
    }
    if (typeof email !== 'string') {
      throw new TypeError('document.shareWith(email) requires a user email.');
    }
    return documentAccessSource(await actions.shareDocument(noteId, email));
  }

  async function rename(title: string): Promise<void> {
    if (!actions.renameDocument) {
      throw new Error('Renaming is not available for this document.');
    }
    if (typeof title !== 'string') {
      throw new TypeError('document.rename(title) requires a document title.');
    }
    await actions.renameDocument(noteId, title);
  }

  async function deleteDocument(): Promise<void> {
    if (!actions.deleteDocument) {
      throw new Error('Deletion is not available for this document.');
    }
    await actions.deleteDocument(noteId);
  }

  return createDocumentNote(noteId, {
    metadata: {
      getText: () => read().title,
      access,
      getSharingSuggestions: () => sharingSuggestions(read(), documents.getChildren()),
      canShareWith: () => documents.getById(noteId)?.shareable === true,
      shareWith,
      canRename: () => Boolean(actions.renameDocument) && documents.getById(noteId) !== null,
      rename,
      canDelete: () => documents.getById(noteId)?.deletable === true && Boolean(actions.deleteDocument),
      delete: deleteDocument,
      subscribe,
    },
  });
}

function createUserDocumentsHandle(
  documents: CollectionSource<UserDocument>,
  actions: UserDataNoteActions,
  parent: () => UserDataNote,
): UserDocumentsNote {
  const noteId = USER_DOCUMENTS_ID;
  const kind = () => 'collection' as const;
  async function create(text: string): Promise<DocumentNote> {
    if (!actions.createDocument) {
      throw new Error('Document creation is not available for this user data.');
    }
    if (typeof text !== 'string') {
      throw new TypeError('documents.create(text) requires a document title.');
    }
    const created = await actions.createDocument(text);
    return createDocumentHandle(created.id, documents, actions);
  }

  const handle: UserDocumentsNote = {
    getId: () => noteId,
    getKind: kind,
    getText: () => USER_DOCUMENTS_TITLE,
    getParent: parent,
    getChildren: () => documents.getChildren().map((document) => createDocumentHandle(document.id, documents, actions)),
    getById: (documentId) => (
      documents.getById(documentId) ? createDocumentHandle(documentId, documents, actions) : null
    ),
    create,
    subscribe: (listener) => documents.subscribe?.(listener) ?? unsubscribeNothing,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createDocumentSourceHandle(
  source: DocumentSource,
  actions: UserDataNoteActions,
  parent: () => DocumentSourcesNote,
): DocumentSourceNote {
  const noteId = source.id;
  const kind = () => 'document-source' as const;
  const documentActions = source.local ? actions : {};
  const documents = createCollectionHandle({
    createItemNote: (document) => createDocumentHandle(document.id, source.documents, documentActions),
    items: source.documents,
    noteId: `${noteId}/documents`,
    text: USER_DOCUMENTS_TITLE,
    parent: sourceRef,
  });
  const handle: DocumentSourceNote = {
    getId: () => noteId,
    getKind: kind,
    getText: () => source.label,
    getParent: parent,
    getChildren: () => [documents],
    getBaseUrl: () => source.baseUrl,
    getDocuments: () => documents,
    getLocal: () => source.local,
    as: createNoteAs(noteId, kind, () => handle),
  };
  function sourceRef() { return handle; }

  return handle;
}

function createDocumentSourcesHandle(
  sources: CollectionSource<DocumentSource>,
  actions: UserDataNoteActions,
  parent: () => UserDataNote,
): DocumentSourcesNote {
  const handle: DocumentSourcesNote = createCollectionHandle({
    createItemNote: (source) => createDocumentSourceHandle(source, actions, () => handle),
    items: sources,
    noteId: USER_DOCUMENT_SOURCES_ID,
    text: USER_DOCUMENT_SOURCES_TITLE,
    parent,
  });
  return handle;
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

export function createUserDataRootNote(
  documents: CollectionSourceInput<UserDocument>,
  actions: UserDataNoteActions = {},
): UserDataNote {
  const noteId = USER_DATA_ROOT_ID;
  const kind = () => 'user-data' as const;
  const userDocumentsSource = resolveCollectionSource(documents);
  const userDocuments = createUserDocumentsHandle(userDocumentsSource, actions, userDataRef);
  const documentSources = createDocumentSourcesHandle(
    actions.documentSources ?? createArrayCollectionSource([{
      baseUrl: null,
      documents: userDocumentsSource,
      id: LOCAL_DOCUMENT_SOURCE_ID,
      label: 'Current Server',
      local: true,
    }]),
    actions,
    userDataRef,
  );

  const handle: UserDataNote = {
    getId: () => noteId,
    getKind: kind,
    getText: () => USER_DATA_TITLE,
    getParent: () => null,
    getChildren: () => [documentSources, userDocuments],
    getDocumentSources: () => documentSources,
    getDocuments: () => userDocuments,
    documentRef: (documentId) => createDocumentHandle(documentId, userDocumentsSource, actions),
    as: createNoteAs(noteId, kind, () => handle),
  };
  function userDataRef() { return handle; }

  return handle;
}
