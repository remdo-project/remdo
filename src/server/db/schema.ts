export const DOCUMENT_ACCESS_MODES = ['private', 'public', 'link-shared'] as const;
export const DOCUMENT_KINDS = ['document', 'home-document', 'user-config'] as const;

export type DocumentAccessMode = (typeof DOCUMENT_ACCESS_MODES)[number];
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENTS_TABLE_COLUMNS = [
  'id',
  'owner_user_id',
  'document_kind',
  'title',
  'access_mode',
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
    access_mode TEXT NOT NULL DEFAULT 'private'
      CHECK (access_mode IN (${sqlStringList(DOCUMENT_ACCESS_MODES)})),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS documents_unique_owner_special_kind
    ON documents(owner_user_id, document_kind)
    WHERE document_kind IN ('home-document', 'user-config');
`;
