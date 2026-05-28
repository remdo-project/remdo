import type { UserDocumentsNote, DocumentNote, UserDataNote } from './contracts';
import type { ChildPosition, NoteId } from '@/notes/contracts';
import { createNoteAs } from '@/notes/handle-utils';

const USER_DATA_ROOT_ID = 'user-data';
const USER_DOCUMENTS_ID = 'user-documents';
const USER_DATA_TITLE = 'User Data';
const USER_DOCUMENTS_TITLE = 'Documents';

export interface UserDocument {
  id: NoteId;
  title: string;
}

interface UserDataNoteActions {
  createDocument?: (title: string) => Promise<UserDocument>;
  homeDocumentId?: () => NoteId | null;
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
  const kind = () => 'user-documents' as const;
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
    create,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

export function createUserDataRootNote(
  documents: readonly UserDocument[],
  actions: UserDataNoteActions = {},
): UserDataNote {
  const noteId = USER_DATA_ROOT_ID;
  const kind = () => 'user-data' as const;
  const userDocuments = createUserDocumentsHandle(documents, actions);

  function homeDocument(): DocumentNote {
    const homeDocumentId = actions.homeDocumentId?.() ?? null;
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
    children: () => [userDocuments],
    homeDocument,
    documents: () => userDocuments,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}
