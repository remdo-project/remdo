import type { EditorNote } from '@/editor/notes/contracts';
import type { Note, NoteId, NoteKind } from '@/notes/contracts';

export interface UserConfigNote extends Note<'user-config'> {}

export interface DocumentListNote extends Note<'document-list'> {}

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
