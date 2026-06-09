import type { EditorNote } from './editor';
import type { ChildPosition, Note } from './notes';

export interface UserDataNote extends Note<'user-data'> {
  /** Returns the user's home document note. */
  homeDocument: () => DocumentNote;
  /** Returns the user-documents child note. */
  documents: () => UserDocumentsNote;
  /** Returns the user's linkable source-server notes. */
  sourceServers: () => SourceServersNote;
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

export interface SourceServersNote extends Note<'source-servers'> {
  /** Returns all source servers in display order. */
  children: () => readonly SourceServerNote[];
  /** Returns the source server with the given id, if present. */
  byId: (sourceServerId: string) => SourceServerNote | null;
}

export interface SourceServerNote extends Note<'source-server'> {
  /** Returns the source server origin. */
  baseUrl: () => string;
  /** Returns whether the current user has linked this source server. */
  linked: () => boolean;
  /** Starts account linking for this source server. */
  link: () => Promise<void>;
}
