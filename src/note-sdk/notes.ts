import type {
  DocumentAccessNote,
  DocumentSourceNote,
  DocumentNote,
  SourceServerNote,
  UserDataNote,
} from './documents';
import type { EditorNote } from './editor';

export type NoteId = string;
export type RelativePlacement = { before: NoteId } | { after: NoteId };
export type ChildPosition = RelativePlacement | { index: number };
export type NoteKind =
  | 'editor-note'
  | 'user-data'
  | 'document'
  | 'document-access'
  | 'document-source'
  | 'collection'
  | 'source-server';

export interface Note<K extends NoteKind = NoteKind> {
  /** Stable id for a note. */
  id: () => NoteId;
  /** Runtime discriminator for note shape/role. */
  kind: () => K;
  /** Returns current note text. Throws when note does not exist. */
  text: () => string;
  /** Returns direct child notes. */
  children: () => readonly Note[];
  /** Narrows the note by runtime kind; throws when the expected kind does not match. */
  as: {
    (kind: 'editor-note'): EditorNote;
    (kind: 'user-data'): UserDataNote;
    (kind: 'document'): DocumentNote;
    (kind: 'document-access'): DocumentAccessNote;
    (kind: 'document-source'): DocumentSourceNote;
    (kind: 'collection'): CollectionNote;
    (kind: 'source-server'): SourceServerNote;
    (kind: NoteKind): Note;
  };
}

export interface CollectionNote<Item extends Note = Note> extends Note<'collection'> {
  /** Returns the projected collection entries in display order. */
  children: () => readonly Item[];
  /** Returns the projected collection entry with the given id, if present. */
  byId: (noteId: NoteId) => Item | null;
}
