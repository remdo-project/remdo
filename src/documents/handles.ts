import type { DocumentListNote, DocumentNote, UserConfigNote } from './contracts';
import type { Note, NoteId, NoteKind } from '@/notes/contracts';
import { createNoteAs } from '@/notes/handle-utils';

interface UserConfigSource {
  rootId: () => NoteId;
  kindOf: (noteId: NoteId) => NoteKind;
  textOf: (noteId: NoteId) => string;
  childrenOf: (noteId: NoteId) => readonly NoteId[];
}

function createDocumentHandle(userConfig: UserConfigSource, noteId: NoteId): DocumentNote {
  const kind = () => 'document' as const;

  const handle: DocumentNote = {
    id: () => noteId,
    kind,
    text: () => userConfig.textOf(noteId),
    children: () => [],
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createDocumentListHandle(userConfig: UserConfigSource, noteId: NoteId): DocumentListNote {
  const kind = () => 'document-list' as const;

  const handle: DocumentListNote = {
    id: () => noteId,
    kind,
    text: () => userConfig.textOf(noteId),
    children: () => userConfig.childrenOf(noteId).map((childId) => createDocumentHandle(userConfig, childId)),
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createUserConfigHandle(userConfig: UserConfigSource, noteId: NoteId): UserConfigNote {
  const kind = () => 'user-config' as const;

  const handle: UserConfigNote = {
    id: () => noteId,
    kind,
    text: () => userConfig.textOf(noteId),
    children: () => userConfig.childrenOf(noteId).map((childId) => createUserConfigNote(userConfig, childId)),
    documentList: () => createDocumentListHandle(userConfig, userConfig.childrenOf(noteId)[0]!),
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

function createUserConfigNote(userConfig: UserConfigSource, noteId: NoteId): Note {
  const noteKind = userConfig.kindOf(noteId);
  if (noteKind === 'user-config') {
    return createUserConfigHandle(userConfig, noteId);
  }
  if (noteKind === 'document-list') {
    return createDocumentListHandle(userConfig, noteId);
  }
  return createDocumentHandle(userConfig, noteId);
}

export function createUserConfigRootNote(userConfig: UserConfigSource): UserConfigNote {
  return createUserConfigHandle(userConfig, userConfig.rootId());
}
