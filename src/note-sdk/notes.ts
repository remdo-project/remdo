import type { UserDocumentsNote, DocumentNote, UserDataNote } from './documents';
import type { EditorNote } from './editor';

export type NoteId = string;
export type RelativePlacement = { before: NoteId } | { after: NoteId };
export type ChildPosition = RelativePlacement | { index: number };
export type NoteKind =
  | 'editor-note'
  | 'user-data'
  | 'user-documents'
  | 'document';

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
    (kind: 'user-documents'): UserDocumentsNote;
    (kind: 'document'): DocumentNote;
    (kind: NoteKind): Note;
  };
}
