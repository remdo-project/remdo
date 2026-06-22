import type {
  DocumentAccessNote,
  DocumentSourceNote,
  DocumentNote,
  SourceServerNote,
  UserDataNote,
} from './documents';
import type { BodyNote, EditorNote } from './editor';

export type NoteId = string;
export type RelativePlacement = { before: NoteId } | { after: NoteId };
export type ChildPosition = RelativePlacement | { index: number };
export type NoteKind =
  | 'editor-note'
  | 'body'
  | 'user-data'
  | 'document'
  | 'document-access'
  | 'document-source'
  | 'collection'
  | 'source-server';

export interface Note<K extends NoteKind = NoteKind> {
  /** Runtime discriminator for note shape/role. */
  kind: () => K;
  /** Returns current note text. Throws when note does not exist. */
  text: () => string;
  /** Returns direct child notes. */
  children: () => readonly Note[];
  /** Narrows the note by runtime kind; throws when the expected kind does not match. */
  as: {
    (kind: 'editor-note'): EditorNote;
    (kind: 'body'): BodyNote;
    (kind: 'user-data'): UserDataNote;
    (kind: 'document'): DocumentNote;
    (kind: 'document-access'): DocumentAccessNote;
    (kind: 'document-source'): DocumentSourceNote;
    (kind: 'collection'): CollectionNote;
    (kind: 'source-server'): SourceServerNote;
    (kind: NoteKind): Note;
  };
}

/** A note kind that carries a stable, unique id within its tree. */
export interface AddressableNote<K extends NoteKind = NoteKind> extends Note<K> {
  /** Stable id for a note. */
  id: () => NoteId;
}

export interface CollectionNote<Item extends Note = Note> extends AddressableNote<'collection'> {
  /** Returns the projected collection entries in display order. */
  children: () => readonly Item[];
  /** Returns the projected collection entry with the given id, if present. */
  byId: (noteId: NoteId) => Item | null;
}
