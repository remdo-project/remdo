import type { DocumentMetadataSource, DocumentNote } from '@/documents/contracts';
import type { EditorNote } from '@/editor/notes/contracts';
import type { EditorNotesAdapter } from '@/editor/notes/sdk-contracts';
import type { Note, NoteId } from '@/notes/contracts';
import { createNoteAs } from '@/notes/handle-utils';

export function createUserConfigHandle(metadata: DocumentMetadataSource, noteId: NoteId): Note {
  const kind = () => metadata.userConfigKindOf(noteId);

  const handle: Note = {
    id: () => noteId,
    kind,
    text: () => metadata.userConfigTextOf(noteId),
    children: () => metadata.userConfigChildrenOf(noteId).map((childId) => createUserConfigHandle(metadata, childId)),
    as: createNoteAs(noteId, kind, () => handle),
  };

  return handle;
}

export function createCurrentDocumentHandle(
  adapter: EditorNotesAdapter,
  metadata: DocumentMetadataSource,
  createEditorNote: (noteId: NoteId) => EditorNote
): DocumentNote {
  const currentDocId = adapter.docId();
  const kind = () => 'document' as const;

  const handle: DocumentNote = {
    id: () => currentDocId,
    kind,
    text: () => {
      if (metadata.hasUserConfigNote(currentDocId) && metadata.userConfigKindOf(currentDocId) === 'document') {
        return metadata.userConfigTextOf(currentDocId);
      }
      return currentDocId;
    },
    children: () => adapter.currentDocumentChildrenIds().map((noteId) => createEditorNote(noteId)),
    as: createNoteAs(currentDocId, kind, () => handle),
  };

  return handle;
}
