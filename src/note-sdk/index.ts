export type {
  ChildPosition,
  Note,
  NoteId,
  NoteKind,
  RelativePlacement,
} from './notes';
export type {
  DocumentNote,
  SourceServerNote,
  SourceServersNote,
  UserDataNote,
  UserDocumentsNote,
} from './documents';
export type { SourceServer } from '#domain/source-servers';
export type { UserDocument } from '#domain/documents/user-data';
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
