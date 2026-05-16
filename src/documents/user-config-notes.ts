import type { DocumentListNote, DocumentNote, UserConfigNote } from './contracts';
import type { ChildPosition, NoteId } from '@/notes/contracts';
import { createNoteAs } from '@/notes/handle-utils';

const USER_CONFIG_ROOT_ID = 'user-config';
const DOCUMENT_LIST_ID = 'document-list';
const USER_CONFIG_TITLE = 'User Config';
const DOCUMENT_LIST_TITLE = 'Documents';

export interface ListedDocument {
  id: NoteId;
  title: string;
}

interface UserConfigNoteActions {
  createDocument?: (title: string) => Promise<ListedDocument>;
  onChange?: () => void;
}

function createDocumentHandle(document: ListedDocument): DocumentNote {
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

function createDocumentListHandle(
  documents: ListedDocument[],
  actions: UserConfigNoteActions,
): DocumentListNote {
  const noteId = DOCUMENT_LIST_ID;
  const kind = () => 'document-list' as const;
  async function create(text: string): Promise<DocumentNote> {
    if (!actions.createDocument) {
      throw new Error('Document creation is not available for this user config.');
    }
    if (typeof text !== 'string') {
      throw new TypeError('documentList.create(text) requires a document title.');
    }
    const created = await actions.createDocument(text);
    documents.push(created);
    actions.onChange?.();
    return createDocumentHandle(created);
  }

  const handle: DocumentListNote = {
    id: () => noteId,
    kind,
    text: () => DOCUMENT_LIST_TITLE,
    children: () => documents.map((document) => createDocumentHandle(document)),
    create,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

export function createUserConfigRootNote(
  documents: ListedDocument[],
  actions: UserConfigNoteActions = {},
): UserConfigNote {
  const noteId = USER_CONFIG_ROOT_ID;
  const kind = () => 'user-config' as const;
  const documentList = createDocumentListHandle(documents, actions);

  const handle: UserConfigNote = {
    id: () => noteId,
    kind,
    text: () => USER_CONFIG_TITLE,
    children: () => [documentList],
    documentList: () => documentList,
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}
