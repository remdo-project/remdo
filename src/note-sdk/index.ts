export type {
  ChildPosition,
  Note,
  NoteId,
  NoteKind,
  RelativePlacement,
} from './notes';
export type {
  DocumentNote,
  UserDataNote,
  UserDocumentsNote,
} from './documents';
export type { UserDocument } from './create-user-data-notes';
export type {
  EditorNote,
  EditorNotes,
  EditorNotesAdapter,
  NoteRange,
  PlaceTarget,
  SelectionSnapshot,
} from './editor';
export { createEditorNotes } from './create-editor-notes';
export { createUserDataRootNote } from './create-user-data-notes';
export { NoteNotFoundError } from './errors';
