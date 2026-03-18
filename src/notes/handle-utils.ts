import type {
  DocumentListNote,
  DocumentNote,
  EditorNote,
  Note,
  NoteId,
  NoteKind,
  UserConfigNote,
} from './contracts';

export function createNoteAs(noteId: NoteId, kind: () => NoteKind, self: () => Note): Note['as'] {
  function asNote(kindToMatch: 'editor-note'): EditorNote;
  function asNote(kindToMatch: 'user-config'): UserConfigNote;
  function asNote(kindToMatch: 'document-list'): DocumentListNote;
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
