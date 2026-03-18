import type { DocumentNote, UserConfigSource } from '@/documents/contracts';
import type { EditorNote } from '@/editor/notes/contracts';
import type { EditorNotesAdapter } from '@/editor/notes/sdk-contracts';
import type { Note, NoteId } from '@/notes/contracts';
import { createNoteAs } from '@/notes/handle-utils';

export function createUserConfigNote(userConfig: UserConfigSource, noteId: NoteId): Note {
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

export function createCurrentDocumentHandle(
  adapter: EditorNotesAdapter,
  userConfig: UserConfigSource,
  createEditorNote: (noteId: NoteId) => EditorNote
): DocumentNote {
  const currentDocId = adapter.docId();
  const kind = () => 'document' as const;

  const handle: DocumentNote = {
    id: () => currentDocId,
    kind,
    text: () => {
      if (userConfig.hasNote(currentDocId) && userConfig.kindOf(currentDocId) === 'document') {
        return userConfig.textOf(currentDocId);
      }
      return currentDocId;
    },
    children: () => adapter.currentDocumentChildrenIds().map((noteId) => createEditorNote(noteId)),
    as: createNoteAs(currentDocId, kind, () => handle),
  };

  return handle;
}
