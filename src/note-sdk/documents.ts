import type { AddressableNote, CollectionNote } from './notes';

export interface UserDataNote extends AddressableNote<'user-data'> {
  /** Returns document lists grouped by current and linked source servers. */
  getDocumentSources: () => DocumentSourcesNote;
  /** Returns the user-documents child note. */
  getDocuments: () => UserDocumentsNote;
}

export interface UserDocumentsNote extends CollectionNote<DocumentNote> {
  /** Creates a user document. */
  create: (text: string) => Promise<DocumentNote>;
}

export type DocumentSourcesNote = CollectionNote<DocumentSourceNote>;

export interface DocumentSourceNote extends AddressableNote<'document-source'> {
  /** Returns the source server origin, when the source is remote. */
  getBaseUrl: () => string | null;
  /** Returns documents projected by this source. */
  getDocuments: () => CollectionNote<DocumentNote>;
  /** Returns whether this source is the current/home server. */
  getLocal: () => boolean;
}

export interface DocumentNote extends AddressableNote<'document'> {
  /** Returns direct access grants for this document. */
  getAccess: () => CollectionNote<DocumentAccessNote>;
  /** Returns whether this document can grant direct local-user access. */
  canShareWith: () => boolean;
  /** Grants document access to a user email. */
  shareWith: (email: string) => Promise<DocumentAccessNote>;
}

export interface DocumentAccessNote extends AddressableNote<'document-access'> {
  /** Returns the shared user's email address. */
  getEmail: () => string;
  /** Returns the shared user's local auth user id. */
  getGranteeUserId: () => string;
  /** Returns the shared user's display name, when available. */
  getName: () => string | null;
}
