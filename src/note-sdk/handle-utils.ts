import type {
  DocumentNote,
  SourceServerNote,
  UserDataNote,
} from './documents';
import type { EditorNote } from './editor';
import type {
  Note,
  CollectionNote,
  NoteId,
  NoteKind,
} from './notes';

export function createNoteAs(noteId: NoteId, kind: () => NoteKind, self: () => Note): Note['as'] {
  function asNote(kindToMatch: 'editor-note'): EditorNote;
  function asNote(kindToMatch: 'user-data'): UserDataNote;
  function asNote(kindToMatch: 'document'): DocumentNote;
  function asNote(kindToMatch: 'collection'): CollectionNote;
  function asNote(kindToMatch: 'source-server'): SourceServerNote;
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
