import type { Note, NoteId, NoteKind } from '@/notes/contracts';
import { createNoteAs } from '@/notes/handle-utils';

interface UserConfigSource {
  rootId: () => NoteId;
  kindOf: (noteId: NoteId) => NoteKind;
  textOf: (noteId: NoteId) => string;
  childrenOf: (noteId: NoteId) => readonly NoteId[];
}

function createUserConfigNote(userConfig: UserConfigSource, noteId: NoteId): Note {
  const kind = () => userConfig.kindOf(noteId);

  const handle: Note = {
    id: () => noteId,
    kind,
    text: () => userConfig.textOf(noteId),
    children: () => userConfig.childrenOf(noteId).map((childId) => createUserConfigNote(userConfig, childId)),
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

export function createUserConfigRootNote(userConfig: UserConfigSource): Note<'user-config'> {
  return createUserConfigNote(userConfig, userConfig.rootId()).as('user-config');
}
