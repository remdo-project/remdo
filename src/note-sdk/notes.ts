import type {
  DocumentAccessNote,
  DocumentSourceNote,
  DocumentNote,
  UserDataNote,
} from './documents';
import type { OpenDocumentNote } from './open-document';

export type NoteId = string;
/** Runtime kinds in document content and the user-data resource graph. */
export type NoteKind =
  | 'user-data'
  | 'document'
  | 'editor-note'
  | 'document-access'
  | 'document-source'
  | 'collection';

export interface Note<K extends NoteKind = NoteKind> {
  /** Runtime discriminator for note shape/role. */
  getKind: () => K;
  /** Returns current note text. Throws when note does not exist. */
  getText: () => string;
  /** Returns the canonical containing note, or null at the tree root. Throws when unknown. */
  getParent: () => Note | null;
  /** Lists direct notes, including results of a collection, without changing their parents. */
  getChildren: () => readonly Note[];
  /** Narrows the note by runtime kind; throws when the expected kind does not match. */
  as: {
    (kind: 'user-data'): UserDataNote;
    (kind: 'document'): DocumentNote;
    (kind: 'editor-note'): OpenDocumentNote;
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
  getChildren: () => readonly Item[];
  /** Returns a listed note with the given id, if present. */
  getById: (noteId: NoteId) => Item | null;
  /** Notifies when collection entries or availability may have changed. */
  subscribe: (listener: () => void) => () => void;
}
