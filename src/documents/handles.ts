import type { DocumentNote } from '@/documents/contracts';
import type { EditorNote } from '@/editor/notes/contracts';
import type { Note, NoteId, NoteSdkAdapter } from '@/notes/contracts';
import { NoteNotFoundError } from '@/notes/errors';
import { createNoteAs } from '@/notes/handle-utils';

const assertUserConfigNoteExists = (adapter: NoteSdkAdapter, noteId: NoteId): void => {
  if (!adapter.hasUserConfigNote(noteId)) {
    throw new NoteNotFoundError(noteId);
  }
};

export function createUserConfigHandle(adapter: NoteSdkAdapter, noteId: NoteId): Note {
  const kind = () => {
    assertUserConfigNoteExists(adapter, noteId);
    return adapter.userConfigKindOf(noteId);
  };

  const handle: Note = {
    id: () => noteId,
    kind,
    text: () => {
      assertUserConfigNoteExists(adapter, noteId);
      return adapter.userConfigTextOf(noteId);
    },
    children: () => {
      assertUserConfigNoteExists(adapter, noteId);
      return adapter.userConfigChildrenOf(noteId).map((childId) => createUserConfigHandle(adapter, childId));
    },
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

export function createCurrentDocumentHandle(
  adapter: NoteSdkAdapter,
  createEditorNote: (noteId: NoteId) => EditorNote
): DocumentNote {
  const currentDocId = adapter.docId();
  const kind = () => 'document' as const;

  const handle: DocumentNote = {
    id: () => currentDocId,
    kind,
    text: () => {
      if (adapter.hasUserConfigNote(currentDocId) && adapter.userConfigKindOf(currentDocId) === 'document') {
        return adapter.userConfigTextOf(currentDocId);
      }
      return currentDocId;
    },
    children: () => adapter.currentDocumentChildrenIds().map((noteId) => createEditorNote(noteId)),
    as: createNoteAs(currentDocId, kind, () => handle),
  };

  return handle;
}
