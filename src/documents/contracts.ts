import type { EditorNote } from '@/editor/notes/contracts';
import type { ChildPosition, Note } from '@/notes/contracts';

export const HOME_DOCUMENT_TITLE = 'Home';

export interface UserDataNote extends Note<'user-data'> {
  /** Returns the user's home document note. */
  homeDocument: () => DocumentNote;
  /** Returns the user-documents child note. */
  documents: () => UserDocumentsNote;
}

export interface UserDocumentsNote extends Note<'user-documents'> {
  /** Returns all user documents in display order. */
  children: () => readonly DocumentNote[];
  /** Creates a user document. */
  create: (text: string) => Promise<DocumentNote>;
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
