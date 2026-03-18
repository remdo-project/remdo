import type { EditorNote } from '@/editor/notes/contracts';
import type { Note } from '@/notes/contracts';

export interface UserConfigNote extends Note<'user-config'> {
  /** Returns the single document-list child note. */
  documentList: () => DocumentListNote;
}

export interface DocumentListNote extends Note<'document-list'> {
  /** Returns all listed documents in display order. */
  children: () => readonly DocumentNote[];
}

export interface DocumentNote extends Note<'document'> {
  /** Returns direct document-root editor notes in display order. */
  children: () => readonly EditorNote[];
}
