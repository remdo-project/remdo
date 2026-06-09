import type { SourceServer } from '#domain/source-servers';
import type { UserDocument } from '#domain/documents/user-data';
import type {
  DocumentNote,
  SourceServerNote,
  SourceServersNote,
  UserDataNote,
  UserDocumentsNote,
} from './documents';
import type { ChildPosition, CollectionNote, Note, NoteId } from './notes';
import { createNoteAs } from './handle-utils';

const USER_DATA_ROOT_ID = 'user-data';
const USER_DOCUMENTS_ID = 'user-documents';
const USER_DATA_TITLE = 'User Data';
const USER_DOCUMENTS_TITLE = 'Documents';

interface UserDataNoteActions {
  createDocument?: (title: string) => Promise<UserDocument>;
  homeDocumentId?: () => NoteId | null;
  linkSourceServer?: (sourceServerId: NoteId) => Promise<void>;
}

function createDocumentHandle(document: UserDocument): DocumentNote {
  const noteId = document.id;
  const kind = () => 'document' as const;
  function create(_text: string): never;
  function create(_position: ChildPosition, _text: string): never;
  function create(): never {
    throw new Error('Only the current document supports editor note creation.');
  }

  const handle: DocumentNote = {
    id: () => noteId,
    kind,
    text: () => document.title,
    children: () => [],
    create,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createUserDocumentsHandle(
  documents: readonly UserDocument[],
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
    return createDocumentHandle(created);
  }

  const handle: UserDocumentsNote = {
    id: () => noteId,
    kind,
    text: () => USER_DOCUMENTS_TITLE,
    children: () => documents.map((document) => createDocumentHandle(document)),
    byId: (documentId) => {
      const document = documents.find((candidate) => candidate.id === documentId);
      return document ? createDocumentHandle(document) : null;
    },
    create,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createCollectionHandle<Item extends { id: NoteId }, ItemNote extends Note>({
  createItemNote,
  items,
  noteId,
  text,
}: {
  createItemNote: (item: Item) => ItemNote;
  items: readonly Item[];
  noteId: NoteId;
  text: string;
}): CollectionNote<ItemNote> {
  const kind = () => 'collection' as const;
  const handle: CollectionNote<ItemNote> = {
    id: () => noteId,
    kind,
    text: () => text,
    children: () => items.map((item) => createItemNote(item)),
    byId: (itemId) => {
      const item = items.find((candidate) => candidate.id === itemId);
      return item ? createItemNote(item) : null;
    },
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createSourceServerHandle(
  sourceServer: SourceServer,
  actions: UserDataNoteActions,
): SourceServerNote {
  const noteId = sourceServer.id;
  const kind = () => 'source-server' as const;
  const handle: SourceServerNote = {
    id: () => noteId,
    kind,
    text: () => sourceServer.label,
    children: () => [],
    baseUrl: () => sourceServer.baseUrl,
    linked: () => sourceServer.linked,
    link: async () => {
      if (!actions.linkSourceServer) {
        throw new Error('Source server linking is not available for this user data.');
      }
      await actions.linkSourceServer(noteId);
    },
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createSourceServersHandle(
  sourceServers: readonly SourceServer[],
  actions: UserDataNoteActions,
): SourceServersNote {
  return createCollectionHandle({
    createItemNote: (sourceServer) => createSourceServerHandle(sourceServer, actions),
    items: sourceServers,
    noteId: 'source-servers',
    text: 'Source Servers',
  });
}

export function createUserDataRootNote(
  documents: readonly UserDocument[],
  sourceServersOrActions: readonly SourceServer[] | UserDataNoteActions = [],
  actions: UserDataNoteActions = {},
): UserDataNote {
  const noteId = USER_DATA_ROOT_ID;
  const kind = () => 'user-data' as const;
  let sourceServers: readonly SourceServer[] = [];
  let resolvedActions: UserDataNoteActions = actions;
  if (Array.isArray(sourceServersOrActions)) {
    sourceServers = sourceServersOrActions;
  } else {
    resolvedActions = sourceServersOrActions as UserDataNoteActions;
  }
  const userDocuments = createUserDocumentsHandle(documents, resolvedActions);
  const userSourceServers = createSourceServersHandle(sourceServers, resolvedActions);

  function homeDocument(): DocumentNote {
    const homeDocumentId = resolvedActions.homeDocumentId?.() ?? null;
    const document = homeDocumentId
      ? documents.find((candidate) => candidate.id === homeDocumentId)
      : documents[0];
    if (!document) {
      throw new Error('Home document is not available.');
    }
    return createDocumentHandle(document);
  }

  const handle: UserDataNote = {
    id: () => noteId,
    kind,
    text: () => USER_DATA_TITLE,
    children: () => [userDocuments, userSourceServers],
    homeDocument,
    documents: () => userDocuments,
    sourceServers: () => userSourceServers,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}
