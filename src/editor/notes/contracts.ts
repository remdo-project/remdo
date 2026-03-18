import type { Note } from '@/notes/contracts';

export interface EditorNote extends Note<'editor-note'> {
  /** True when the note still exists in the current editor state. */
  attached: () => boolean;
  /** Returns direct child editor notes. Throws when the note does not exist. */
  children: () => readonly EditorNote[];
}
