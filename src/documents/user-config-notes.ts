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
  createDocument?: (position: ChildPosition | undefined, title: string) => Promise<ListedDocument>;
}

export function resolveListedDocumentInsertIndex(
  documents: readonly ListedDocument[],
  position?: ChildPosition,
): number {
  if (!position) {
    return documents.length;
  }

  if ('index' in position) {
    if (position.index >= 0) {
      return Math.min(position.index, documents.length);
    }
    return Math.max(0, Math.min(documents.length, documents.length + position.index + 1));
  }

  const anchorId = 'before' in position ? position.before : position.after;
  const anchorIndex = documents.findIndex((document) => document.id === anchorId);
  if (anchorIndex === -1) {
    throw new Error(`Document "${anchorId}" is not listed in user config.`);
  }
  return 'before' in position ? anchorIndex : anchorIndex + 1;
}

function resolveCreateArgs(
  arg1: string | ChildPosition,
  arg2?: string,
): { position?: ChildPosition; text: string } {
  if (typeof arg1 === 'string') {
    return { text: arg1 };
  }
  if (typeof arg2 !== 'string') {
    throw new TypeError('create(position, text) requires explicit document title.');
  }
  return { position: arg1, text: arg2 };
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
  async function create(arg1: string | ChildPosition, arg2?: string): Promise<DocumentNote> {
    if (!actions.createDocument) {
      throw new Error('Document creation is not available for this user config.');
    }
    const { position, text } = resolveCreateArgs(arg1, arg2);
    const created = await actions.createDocument(position, text);
    const insertIndex = resolveListedDocumentInsertIndex(documents, position);
    documents.splice(insertIndex, 0, created);
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
