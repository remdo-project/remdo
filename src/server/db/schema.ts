export const DOCUMENT_KINDS = ['document', 'home-document', 'user-data-projection'] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface RemdoDatabase {
  document_access: DocumentAccessTable;
  documents: DocumentsTable;
  oauthClient: AuthOauthClientTable;
  source_servers: SourceServersTable;
  user: AuthUserTable;
}

// A home's linkable source servers: a self-filling cache keyed by origin. A row
// is created on first link to a URL; client_id is null until self-registration
// fills it, after which the row becomes a usable OAuth provider at the next
// auth-instance build.
// base_url (a bare origin) is the sole stored identity: the public source id and
// the display label are both derived from it (see deriveSourceId / deriveSourceLabel).
export interface SourceServersTable {
  base_url: string;
  client_id: string | null;
  created_at: number;
}

interface AuthOauthClientTable {
  clientId: string;
}

interface AuthUserTable {
  email: string;
  id: string;
  name: string | null;
  // Added by the Better Auth admin plugin; null until a role is assigned.
  role: string | null;
}

export interface DocumentAccessTable {
  document_id: string;
  grantee_user_id: string;
}

export interface DocumentsTable {
  created_at: number;
  document_kind: DocumentKind;
  id: string;
  owner_user_id: string;
  title: string;
  updated_at: number;
}
