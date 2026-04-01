import type { DocumentListNote, DocumentNote, UserConfigNote } from './contracts';
import type { NoteId } from '@/notes/contracts';
import { createNoteAs } from '@/notes/handle-utils';

const USER_CONFIG_ROOT_ID = 'user-config';
const DOCUMENT_LIST_ID = 'document-list';
const USER_CONFIG_TITLE = 'User Config';
const DOCUMENT_LIST_TITLE = 'Documents';

interface ListedDocument {
  id: NoteId;
  title: string;
}

function createDocumentHandle(document: ListedDocument): DocumentNote {
  const noteId = document.id;
  const kind = () => 'document' as const;

  const handle: DocumentNote = {
    id: () => noteId,
    kind,
    text: () => document.title,
    children: () => [],
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createDocumentListHandle(documents: readonly ListedDocument[]): DocumentListNote {
  const noteId = DOCUMENT_LIST_ID;
  const kind = () => 'document-list' as const;

  const handle: DocumentListNote = {
    id: () => noteId,
    kind,
    text: () => DOCUMENT_LIST_TITLE,
    children: () => documents.map((document) => createDocumentHandle(document)),
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

export function createUserConfigRootNote(documents: readonly ListedDocument[]): UserConfigNote {
  const noteId = USER_CONFIG_ROOT_ID;
  const kind = () => 'user-config' as const;
  const documentList = createDocumentListHandle(documents);

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
