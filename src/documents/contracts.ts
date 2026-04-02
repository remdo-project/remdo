import type { EditorNote } from '@/editor/notes/contracts';
import type { ChildPosition, Note } from '@/notes/contracts';

export interface UserConfigNote extends Note<'user-config'> {
  /** Returns the single document-list child note. */
  documentList: () => DocumentListNote;
}

export interface DocumentListNote extends Note<'document-list'> {
  /** Returns all listed documents in display order. */
  children: () => readonly DocumentNote[];
  /** Creates and places a listed document relative to this document list. */
  create: {
    (text: string): Promise<DocumentNote>;
    (position: ChildPosition, text: string): Promise<DocumentNote>;
  };
}

export interface DocumentNote extends Note<'document'> {
  /** Returns direct document-root editor notes in display order. */
  children: () => readonly EditorNote[];
  /** Creates and places a direct child note relative to this document. */
  create: {
    (text: string): EditorNote;
    (position: ChildPosition, text: string): EditorNote;
  };
}
