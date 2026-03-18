import type { DocumentNote } from '@/documents/contracts';
import type { EditorNote } from '@/editor/notes/contracts';

export type NoteId = string;
export type NoteKind =
  | 'editor-note'
  | 'user-config'
  | 'document-list'
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
    (kind: 'user-config'): Note<'user-config'>;
    (kind: 'document-list'): Note<'document-list'>;
    (kind: 'document'): DocumentNote;
    (kind: NoteKind): Note;
  };
}
