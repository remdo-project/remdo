export type { NoteId } from './notes';
export type {
  ChildPreview,
  DocumentCapabilitiesSnapshot,
  DocumentSearchOptions,
  DocumentSearchResults,
  DocumentSession,
  LoadState,
  NoteListType,
  OpenDocumentNote,
  EditorNoteSnapshot,
  SearchResult,
  SnapshotStore,
} from './document-session';
export type {
  DocumentSourceNote,
  UserDataNote,
} from './documents';
export type { UserDocument } from '#domain/documents/user-data';
export { createUserDataRootNote } from './create-user-data-notes';
export type { CollectionSource, DocumentSource } from './create-user-data-notes';
export { NoteUnavailableError } from './note-unavailable-error';
