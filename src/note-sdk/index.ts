export type { NoteId } from './notes';
export type {
  ChildPreview,
  DocumentSearchOptions,
  DocumentSearchResults,
  DocumentSession,
  NoteListType,
  OpenDocumentNote,
  EditorNoteSnapshot,
  NewNote,
  SearchResult,
} from './document-session';
export type {
  DocumentNote,
  DocumentSourceNote,
  UserDataNote,
} from './documents';
export type { UserDocument } from '#domain/documents/user-data';
export { createUserDataRootNote } from './create-user-data-notes';
export type { CollectionSource, DocumentSource } from './create-user-data-notes';
export { NoteUnavailableError } from './note-unavailable-error';
export { IneligibleOperationError } from './ineligible-operation-error';
