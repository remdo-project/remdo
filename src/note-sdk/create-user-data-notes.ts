import type { DocumentAccessView } from '#domain/documents/access';
import type { UserDocument } from '#domain/documents/user-data';
import type {
  DocumentAccessNote,
  DocumentSourceNote,
  DocumentSourcesNote,
  DocumentNote,
  UserDataNote,
  UserDocumentsNote,
} from './documents';
import type { CollectionNote, Note, NoteId } from './notes';
import { createNoteAs } from './handle-utils';

const USER_DATA_ROOT_ID = 'user-data';
const USER_DOCUMENT_SOURCES_ID = 'document-sources';
const LOCAL_DOCUMENT_SOURCE_ID = 'local';
const USER_DOCUMENTS_ID = 'user-documents';
const USER_DATA_TITLE = 'User Data';
const USER_DOCUMENT_SOURCES_TITLE = 'Document Sources';
const USER_DOCUMENTS_TITLE = 'Documents';

interface UserDataNoteActions {
  createDocument?: (title: string) => Promise<UserDocument>;
  documentSources?: CollectionSource<DocumentSource>;
  shareDocument?: (documentId: NoteId, email: string) => Promise<DocumentAccessView>;
}

export interface DocumentSource {
  baseUrl: string | null;
  documents: CollectionSource<UserDocument>;
  id: NoteId;
  label: string;
  local: boolean;
}

interface DocumentAccessItem extends DocumentAccessView {
  id: NoteId;
}

export interface CollectionSource<Item extends { id: NoteId }> {
  getChildren: () => readonly Item[];
  getById: (itemId: NoteId) => Item | null;
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

function toDocumentAccessItem(access: DocumentAccessView): DocumentAccessItem {
  return {
    ...access,
    id: access.granteeUserId,
  };
}

function createDocumentAccessNoteHandle(access: DocumentAccessItem): DocumentAccessNote {
  const noteId = access.id;
  const kind = () => 'document-access' as const;
  const handle: DocumentAccessNote = {
    getId: () => noteId,
    getKind: kind,
    getText: () => access.name || access.email,
    getChildren: () => [],
    getEmail: () => access.email,
    getGranteeUserId: () => access.granteeUserId,
    getName: () => access.name,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createDocumentAccessHandle(document: UserDocument): CollectionNote<DocumentAccessNote> {
  const access = createArrayCollectionSource((document.access ?? []).map(toDocumentAccessItem));
  return createCollectionHandle({
    createItemNote: createDocumentAccessNoteHandle,
    items: access,
    noteId: `${document.id}/access`,
    text: 'Access',
  });
}

function createProjectedDocumentHandle(
  document: UserDocument,
  actions: UserDataNoteActions,
): DocumentNote {
  const noteId = document.id;
  const kind = () => 'document' as const;

  async function shareWith(email: string): Promise<DocumentAccessNote> {
    if (!actions.shareDocument) {
      throw new Error('Document sharing is not available for this document.');
    }
    if (typeof email !== 'string') {
      throw new TypeError('document.shareWith(email) requires a user email.');
    }
    return createDocumentAccessNoteHandle(toDocumentAccessItem(await actions.shareDocument(noteId, email)));
  }

  const handle: DocumentNote = {
    getId: () => noteId,
    getKind: kind,
    getText: () => document.title,
    getAccess: () => createDocumentAccessHandle(document),
    getChildren: () => [],
    canShareWith: () => document.shareable === true,
    shareWith,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createUserDocumentsHandle(
  documents: CollectionSource<UserDocument>,
  actions: UserDataNoteActions,
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
    return createProjectedDocumentHandle(created, actions);
  }

  const handle: UserDocumentsNote = {
    getId: () => noteId,
    getKind: kind,
    getText: () => USER_DOCUMENTS_TITLE,
    getChildren: () => documents.getChildren().map((document) => createProjectedDocumentHandle(document, actions)),
    getById: (documentId) => {
      const document = documents.getById(documentId);
      return document ? createProjectedDocumentHandle(document, actions) : null;
    },
    create,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createDocumentSourceHandle(
  source: DocumentSource,
  actions: UserDataNoteActions,
): DocumentSourceNote {
  const noteId = source.id;
  const kind = () => 'document-source' as const;
  const documentActions = source.local ? actions : {};
  const documents = createCollectionHandle({
    createItemNote: (document) => createProjectedDocumentHandle(document, documentActions),
    items: source.documents,
    noteId: `${noteId}/documents`,
    text: USER_DOCUMENTS_TITLE,
  });
  const handle: DocumentSourceNote = {
    getId: () => noteId,
    getKind: kind,
    getText: () => source.label,
    getChildren: () => [documents],
    getBaseUrl: () => source.baseUrl,
    getDocuments: () => documents,
    getLocal: () => source.local,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createDocumentSourcesHandle(
  sources: CollectionSource<DocumentSource>,
  actions: UserDataNoteActions,
): DocumentSourcesNote {
  return createCollectionHandle({
    createItemNote: (source) => createDocumentSourceHandle(source, actions),
    items: sources,
    noteId: USER_DOCUMENT_SOURCES_ID,
    text: USER_DOCUMENT_SOURCES_TITLE,
  });
}

function createCollectionHandle<Item extends { id: NoteId }, ItemNote extends Note>({
  createItemNote,
  items,
  noteId,
  text,
}: {
  createItemNote: (item: Item) => ItemNote;
  items: CollectionSource<Item>;
  noteId: NoteId;
  text: string;
}): CollectionNote<ItemNote> {
  const kind = () => 'collection' as const;
  const handle: CollectionNote<ItemNote> = {
    getId: () => noteId,
    getKind: kind,
    getText: () => text,
    getChildren: () => items.getChildren().map((item) => createItemNote(item)),
    getById: (itemId) => {
      const item = items.getById(itemId);
      return item ? createItemNote(item) : null;
    },
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
  const userDocuments = createUserDocumentsHandle(userDocumentsSource, actions);
  const documentSources = createDocumentSourcesHandle(
    actions.documentSources ?? createArrayCollectionSource([{
      baseUrl: null,
      documents: userDocumentsSource,
      id: LOCAL_DOCUMENT_SOURCE_ID,
      label: 'Current Server',
      local: true,
    }]),
    actions,
  );

  const handle: UserDataNote = {
    getId: () => noteId,
    getKind: kind,
    getText: () => USER_DATA_TITLE,
    getChildren: () => [documentSources, userDocuments],
    getDocumentSources: () => documentSources,
    getDocuments: () => userDocuments,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}
