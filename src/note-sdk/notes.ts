import type {
  DocumentAccessNote,
  DocumentSourceNote,
  DocumentNote,
  UserDataNote,
} from './documents';

export type NoteId = string;
/** Runtime kinds in the user-data resource graph; open-document notes use OpenDocument. */
export type NoteKind =
  | 'user-data'
  | 'document'
  | 'document-access'
  | 'document-source'
  | 'collection';

export interface Note<K extends NoteKind = NoteKind> {
  /** Runtime discriminator for note shape/role. */
  getKind: () => K;
  /** Returns current note text. Throws when note does not exist. */
  getText: () => string;
  /** Returns direct child notes. */
  getChildren: () => readonly Note[];
  /** Narrows the note by runtime kind; throws when the expected kind does not match. */
  as: {
    (kind: 'user-data'): UserDataNote;
    (kind: 'document'): DocumentNote;
    (kind: 'document-access'): DocumentAccessNote;
    (kind: 'document-source'): DocumentSourceNote;
    (kind: 'collection'): CollectionNote;
    (kind: NoteKind): Note;
  };
}

/** A note kind that carries a stable, unique id within its tree. */
export interface AddressableNote<K extends NoteKind = NoteKind> extends Note<K> {
  /** Stable id for a note. */
  getId: () => NoteId;
}

export interface CollectionNote<Item extends Note = Note> extends AddressableNote<'collection'> {
  /** Returns the projected collection entries in display order. */
  getChildren: () => readonly Item[];
  /** Returns the projected collection entry with the given id, if present. */
  getById: (noteId: NoteId) => Item | null;
}
