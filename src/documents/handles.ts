import type { DocumentNote, UserConfigSource, UserConfigNote } from '@/documents/contracts';
import type { EditorNote, EditorNotesAdapter } from '@/editor/notes/contracts';
import type { Note, NoteId } from '@/notes/contracts';
import { createNoteAs } from '@/notes/handle-utils';

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

export function createUserConfigRootNote(userConfig: UserConfigSource): UserConfigNote {
  return createUserConfigNote(userConfig, userConfig.rootId()).as('user-config');
}

export function createCurrentDocumentHandle(
  adapter: EditorNotesAdapter,
  createEditorNote: (noteId: NoteId) => EditorNote
): DocumentNote {
  const currentDocId = adapter.docId();
  const kind = () => 'document' as const;

  const handle: DocumentNote = {
    id: () => currentDocId,
    kind,
    text: () => currentDocId,
    children: () => adapter.currentDocumentChildrenIds().map((noteId) => createEditorNote(noteId)),
    as: createNoteAs(currentDocId, kind, () => handle),
  };

  return handle;
}
