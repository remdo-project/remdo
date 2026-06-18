export type {
  CollectionNote,
  Note,
  NoteId,
  NoteKind,
} from './notes';
export type {
  DocumentAccessNote,
  DocumentSourceNote,
  DocumentNote,
  SourceServerNote,
  UserDataNote,
} from './documents';
export type { UserDocument } from '#domain/documents/user-data';
export type {
  EditorNote,
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
