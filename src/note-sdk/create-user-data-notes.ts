import type { DocumentAccessView } from '#domain/documents/access';
import type { SourceServer } from '#domain/source-servers';
import type { UserDocument } from '#domain/documents/user-data';
import type {
  DocumentAccessNote,
  DocumentSourceNote,
  DocumentSourcesNote,
  DocumentNote,
  SourceServerNote,
  SourceServersNote,
  UserDataNote,
  UserDocumentsNote,
} from './documents';
import type { ChildPosition, CollectionNote, Note, NoteId } from './notes';
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
  homeDocumentId?: () => NoteId | null;
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
  children: () => readonly Item[];
  byId: (itemId: NoteId) => Item | null;
}

type CollectionSourceInput<Item extends { id: NoteId }> = readonly Item[] | CollectionSource<Item>;

function createArrayCollectionSource<Item extends { id: NoteId }>(items: readonly Item[]): CollectionSource<Item> {
  return {
    children: () => items,
    byId: (itemId) => items.find((item) => item.id === itemId) ?? null,
  };
}

function isCollectionSource<Item extends { id: NoteId }>(value: unknown): value is CollectionSource<Item> {
  return typeof value === 'object'
    && value !== null
    && 'children' in value
    && typeof value.children === 'function'
    && 'byId' in value
    && typeof value.byId === 'function';
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
    id: () => noteId,
    kind,
    text: () => access.name ?? access.email,
    children: () => [],
    email: () => access.email,
    granteeUserId: () => access.granteeUserId,
    name: () => access.name,
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
  function create(_text: string): never;
  function create(_position: ChildPosition, _text: string): never;
  function create(): never {
    throw new Error('Only the current document supports editor note creation.');
  }

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
    id: () => noteId,
    kind,
    text: () => document.title,
    access: () => createDocumentAccessHandle(document),
    children: () => [],
    create,
    shareable: () => document.shareable === true,
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
    id: () => noteId,
    kind,
    text: () => USER_DOCUMENTS_TITLE,
    children: () => documents.children().map((document) => createProjectedDocumentHandle(document, actions)),
    byId: (documentId) => {
      const document = documents.byId(documentId);
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
    id: () => noteId,
    kind,
    text: () => source.label,
    children: () => [documents],
    baseUrl: () => source.baseUrl,
    documents: () => documents,
    local: () => source.local,
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
    id: () => noteId,
    kind,
    text: () => text,
    children: () => items.children().map((item) => createItemNote(item)),
    byId: (itemId) => {
      const item = items.byId(itemId);
      return item ? createItemNote(item) : null;
    },
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createSourceServerHandle(
  sourceServer: SourceServer,
): SourceServerNote {
  const noteId = sourceServer.id;
  const kind = () => 'source-server' as const;
  const handle: SourceServerNote = {
    id: () => noteId,
    kind,
    text: () => sourceServer.label,
    children: () => [],
    baseUrl: () => sourceServer.baseUrl,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createSourceServersHandle(
  sourceServers: CollectionSource<SourceServer>,
): SourceServersNote {
  return createCollectionHandle({
    createItemNote: (sourceServer) => createSourceServerHandle(sourceServer),
    items: sourceServers,
    noteId: 'source-servers',
    text: 'Source Servers',
  });
}

export function createUserDataRootNote(
  documents: CollectionSourceInput<UserDocument>,
  sourceServersOrActions: CollectionSourceInput<SourceServer> | UserDataNoteActions = [],
  actions: UserDataNoteActions = {},
): UserDataNote {
  const noteId = USER_DATA_ROOT_ID;
  const kind = () => 'user-data' as const;
  const userDocumentsSource = resolveCollectionSource(documents);
  let sourceServers: CollectionSource<SourceServer> = createArrayCollectionSource([]);
  let resolvedActions: UserDataNoteActions = actions;
  if (Array.isArray(sourceServersOrActions) || isCollectionSource<SourceServer>(sourceServersOrActions)) {
    sourceServers = resolveCollectionSource(sourceServersOrActions);
  } else {
    resolvedActions = sourceServersOrActions as UserDataNoteActions;
  }
  const userDocuments = createUserDocumentsHandle(userDocumentsSource, resolvedActions);
  const documentSources = createDocumentSourcesHandle(
    resolvedActions.documentSources ?? createArrayCollectionSource([{
      baseUrl: null,
      documents: userDocumentsSource,
      id: LOCAL_DOCUMENT_SOURCE_ID,
      label: 'Current Server',
      local: true,
    }]),
    resolvedActions,
  );
  const userSourceServers = createSourceServersHandle(sourceServers);

  function homeDocument(): DocumentNote {
    const homeDocumentId = resolvedActions.homeDocumentId?.() ?? null;
    const document = homeDocumentId
      ? userDocumentsSource.byId(homeDocumentId)
      : userDocumentsSource.children()[0];
    if (!document) {
      throw new Error('Home document is not available.');
    }
    return createProjectedDocumentHandle(document, resolvedActions);
  }

  const handle: UserDataNote = {
    id: () => noteId,
    kind,
    text: () => USER_DATA_TITLE,
    children: () => [documentSources, userDocuments, userSourceServers],
    homeDocument,
    documentSources: () => documentSources,
    documents: () => userDocuments,
    sourceServers: () => userSourceServers,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}
