import type { EditorNote } from '@/editor/notes/contracts';
import type { Note } from '@/notes/contracts';

export interface DocumentNote extends Note<'document'> {
  /** Returns direct document-root editor notes in display order. */
  children: () => readonly EditorNote[];
}
