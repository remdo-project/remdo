export const DOCUMENT_ACCESS_MODES = ['private', 'public', 'link-shared'] as const;

export type DocumentAccessMode = (typeof DOCUMENT_ACCESS_MODES)[number];

export const CREATE_DOCUMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    access_mode TEXT NOT NULL DEFAULT 'private',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;
