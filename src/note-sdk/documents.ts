import type { EditorNote } from './editor';
import type { ChildPosition, CollectionNote, Note } from './notes';

export interface UserDataNote extends Note<'user-data'> {
  /** Returns the user's home document note. */
  homeDocument: () => DocumentNote;
  /** Returns the user-documents child note. */
  documents: () => UserDocumentsNote;
  /** Returns the user's linkable source-server notes. */
  sourceServers: () => SourceServersNote;
}

export interface UserDocumentsNote extends CollectionNote<DocumentNote> {
  /** Creates a user document. */
  create: (text: string) => Promise<DocumentNote>;
}

export interface DocumentNote extends Note<'document'> {
  /** Returns direct access grants for this document. */
  access: () => CollectionNote<DocumentAccessNote>;
  /** Returns direct document-root editor notes in display order. */
  children: () => readonly EditorNote[];
  /** Creates and places a direct child note relative to this document. */
  create: {
    (text: string): EditorNote;
    (position: ChildPosition, text: string): EditorNote;
  };
  /** Grants document access to a user email. */
  shareWith: (email: string) => Promise<DocumentAccessNote>;
}

export interface DocumentAccessNote extends Note<'document-access'> {
  /** Returns the shared user's email address. */
  email: () => string;
  /** Returns the shared user's local auth user id. */
  granteeUserId: () => string;
  /** Returns the shared user's display name, when available. */
  name: () => string | null;
}

export type SourceServersNote = CollectionNote<SourceServerNote>;

export interface SourceServerNote extends Note<'source-server'> {
  /** Returns the source server origin. */
  baseUrl: () => string;
  /** Returns whether the current user has linked this source server. */
  linked: () => boolean;
  /** Starts account linking for this source server. */
  link: () => Promise<void>;
}
