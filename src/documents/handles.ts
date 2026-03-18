import type { DocumentNote } from '@/documents/contracts';
import type { EditorNote } from '@/editor/notes/contracts';
import type { EditorNotesAdapter } from '@/editor/notes/sdk-contracts';
import type { Note, NoteId, NoteKind } from '@/notes/contracts';
import { createNoteAs } from '@/notes/handle-utils';

interface MetadataNotesSource {
  hasUserConfigNote: (noteId: NoteId) => boolean;
  userConfigKindOf: (noteId: NoteId) => NoteKind;
  userConfigTextOf: (noteId: NoteId) => string;
  userConfigChildrenOf: (noteId: NoteId) => readonly NoteId[];
}

export function createUserConfigHandle(adapter: MetadataNotesSource, noteId: NoteId): Note {
  const kind = () => adapter.userConfigKindOf(noteId);

  const handle: Note = {
    id: () => noteId,
    kind,
    text: () => adapter.userConfigTextOf(noteId),
    children: () => adapter.userConfigChildrenOf(noteId).map((childId) => createUserConfigHandle(adapter, childId)),
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
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
