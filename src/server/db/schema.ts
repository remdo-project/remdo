export const DOCUMENT_KINDS = ['document', 'home-document', 'user-data-projection'] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface RemdoDatabase {
  document_access: DocumentAccessTable;
  documents: DocumentsTable;
  oauthClient: AuthOauthClientTable;
  user: AuthUserTable;
}

interface AuthOauthClientTable {
  clientId: string;
}

interface AuthUserTable {
  email: string;
  id: string;
  name: string | null;
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

export const DOCUMENTS_TABLE_COLUMNS = [
  'id',
  'owner_user_id',
  'document_kind',
  'title',
  'created_at',
  'updated_at',
] as const;

function sqlStringList(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ');
}

export const CREATE_DOCUMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    document_kind TEXT NOT NULL DEFAULT 'document'
      CHECK (document_kind IN (${sqlStringList(DOCUMENT_KINDS)})),
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS documents_unique_owner_special_kind
    ON documents(owner_user_id, document_kind)
    WHERE document_kind IN ('home-document', 'user-data-projection');
`;

export const CREATE_DOCUMENT_ACCESS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS document_access (
    document_id TEXT NOT NULL,
    grantee_user_id TEXT NOT NULL,
    PRIMARY KEY(document_id, grantee_user_id)
  );
`;
