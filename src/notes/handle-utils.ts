import type { DocumentNote } from '@/documents/contracts';
import type { EditorNote } from '@/editor/notes/contracts';
import type {
  Note,
  NoteId,
  NoteKind,
} from './contracts';

export function createNoteAs(noteId: NoteId, kind: () => NoteKind, self: () => Note): Note['as'] {
  function asNote(kindToMatch: 'editor-note'): EditorNote;
  function asNote(kindToMatch: 'user-config'): Note<'user-config'>;
  function asNote(kindToMatch: 'document-list'): Note<'document-list'>;
  function asNote(kindToMatch: 'document'): DocumentNote;
  function asNote(kindToMatch: NoteKind): Note;
  function asNote(kindToMatch: NoteKind): Note {
    const actualKind = kind();
    if (actualKind !== kindToMatch) {
      throw new Error(`Note "${noteId}" is "${actualKind}", expected "${kindToMatch}".`);
    }
    return self();
  }
  return asNote;
}
