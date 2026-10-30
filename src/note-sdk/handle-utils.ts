import type { Note, NoteId, NoteKind, NoteKinds } from './notes';

export function createNoteAs(noteId: NoteId, kind: () => NoteKind, self: () => Note): Note['as'] {
  return <Kind extends NoteKind>(kindToMatch: Kind) => {
    const actualKind = kind();
    if (actualKind !== kindToMatch) {
      throw new Error(`Note "${noteId}" is "${actualKind}", expected "${kindToMatch}".`);
    }
    return self() as NoteKinds[Kind];
  };
}
