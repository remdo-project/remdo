export type { NoteId } from './notes';
export type {
  DocumentSourceNote,
  UserDataNote,
} from './documents';
export type { UserDocument } from '#domain/documents/user-data';
export type {
  EditorNotes,
  EditorNotesAdapter,
  NoteListType,
  NoteRange,
  PlaceTarget,
  SelectionSnapshot,
} from './editor';
export { createEditorNotes } from './create-editor-notes';
export { createUserDataRootNote } from './create-user-data-notes';
export type { CollectionSource, DocumentSource } from './create-user-data-notes';
export { NoteNotFoundError } from './errors';
