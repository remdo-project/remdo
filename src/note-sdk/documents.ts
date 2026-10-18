import type { AddressableNote, CollectionNote } from './notes';
import type { OpenDocumentNote } from './open-document';
import type { DocumentContactView } from '#domain/documents/access';

export interface UserDataNote extends AddressableNote<'user-data'> {
  /** Returns a live document reference without checking list membership or loading content. */
  documentRef: (documentId: string) => DocumentNote;
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
  /** Returns null at this host's document boundary; outer parentage is not resolved here. */
  getParent: () => null;
  /** Stable collection references; their contents are independently available. */
  getChildren: () => readonly [DocumentNote['content'], DocumentNote['access']];
  /** The editor outline, with top-level notes as its structural children. */
  readonly content: CollectionNote<OpenDocumentNote>
    & Pick<OpenDocumentNote, 'getChildListType' | 'appendChildren'>
    & { getParent: () => DocumentNote };
  /** Direct access grants, independently available from editor content. */
  readonly access: CollectionNote<DocumentAccessNote> & { getParent: () => DocumentNote };
  /** Returns eligible contacts from current sharing relationships on this source. */
  getSharingSuggestions: () => readonly DocumentContactView[];
  /** Returns whether this document can grant direct local-user access. */
  canShareWith: () => boolean;
  /** Grants document access to a user email. */
  shareWith: (email: string) => Promise<DocumentAccessNote>;
  /** Returns whether this document's name can be changed. */
  canRename: () => boolean;
  /** Changes this document's name through its source server. */
  rename: (title: string) => Promise<DocumentNote>;
  /** Returns whether this document can be deleted. */
  canDelete: () => boolean;
  /** Deletes this document, its content, and its access grants through its source server. */
  delete: () => Promise<void>;
  /** Notifies when metadata, direct children, eligibility, or availability may have changed. */
  subscribe: (listener: () => void) => () => void;
}

export interface DocumentAccessNote extends AddressableNote<'document-access'> {
  /** The collection containing this document's direct grants. */
  getParent: () => DocumentNote['access'];
  /** Returns the shared user's email address. */
  getEmail: () => string;
  /** Returns the shared user's local auth user id. */
  getGranteeUserId: () => string;
  /** Returns the shared user's display name, when available. */
  getName: () => string | null;
}
