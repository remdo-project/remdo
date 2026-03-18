import type { EditorNote } from '@/editor/notes/contracts';
import type { Note, NoteId, NoteKind } from '@/notes/contracts';

export interface DocumentNote extends Note<'document'> {
  /** Returns direct document-root editor notes in display order. */
  children: () => readonly EditorNote[];
}

export interface UserConfigSource {
  rootId: () => NoteId;
  kindOf: (noteId: NoteId) => NoteKind;
  textOf: (noteId: NoteId) => string;
  childrenOf: (noteId: NoteId) => readonly NoteId[];
}
