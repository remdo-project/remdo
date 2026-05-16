import type { StatementSync } from 'node:sqlite';
import { createServerDatabaseClient } from '@/server/db/client';
import type { ServerDatabaseClient } from '@/server/db/client';
import { DOCUMENT_ACCESS_MODES, DOCUMENT_KINDS } from '@/server/db/schema';
import type { DocumentAccessMode, DocumentKind } from '@/server/db/schema';

export interface RegisteredDocument {
  id: string;
  accessMode: DocumentAccessMode;
  kind: DocumentKind;
  ownerUserId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertDocumentInput {
  id: string;
  ownerUserId: string;
  kind?: DocumentKind;
  title: string;
}

export interface DocumentRegistry {
  getDocument: (docId: string) => Promise<RegisteredDocument | null>;
  getUserDocumentByKind: (
    ownerUserId: string,
    kind: Exclude<DocumentKind, 'document'>,
  ) => Promise<RegisteredDocument | null>;
  insertDocument: (input: InsertDocumentInput) => Promise<RegisteredDocument | null>;
  listUserDocuments: (ownerUserId: string) => Promise<RegisteredDocument[]>;
}

interface CreateDocumentRegistryOptions {
  client?: ServerDatabaseClient;
}

interface DocumentRow {
  access_mode: string;
  created_at: number;
  document_kind: string;
  id: string;
  owner_user_id: string;
  title: string;
  updated_at: number;
}

function parseAccessMode(value: string): DocumentAccessMode {
  if (DOCUMENT_ACCESS_MODES.includes(value as DocumentAccessMode)) {
    return value as DocumentAccessMode;
  }

  throw new TypeError(`Unsupported document access mode: ${value}`);
}

function parseDocumentKind(value: string): DocumentKind {
  if (DOCUMENT_KINDS.includes(value as DocumentKind)) {
    return value as DocumentKind;
  }

  throw new TypeError(`Unsupported document kind: ${value}`);
}

function toRegisteredDocument(row: DocumentRow): RegisteredDocument {
  return {
    id: row.id,
    accessMode: parseAccessMode(row.access_mode),
    kind: parseDocumentKind(row.document_kind),
    ownerUserId: row.owner_user_id,
    title: row.title,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

class SqliteDocumentRegistry implements DocumentRegistry {
  private readonly insertDocumentStatement: StatementSync;
  private readonly selectDocumentStatement: StatementSync;
  private readonly selectUserDocumentByKindStatement: StatementSync;
  private readonly selectUserDocumentsStatement: StatementSync;

  constructor(client: ServerDatabaseClient) {
    this.insertDocumentStatement = client.sqlite.prepare(`
      INSERT INTO documents (
        id,
        owner_user_id,
        document_kind,
        title,
        access_mode,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 'private', ?, ?)
      ON CONFLICT DO NOTHING
    `);
    this.selectDocumentStatement = client.sqlite.prepare(`
      SELECT id, owner_user_id, document_kind, title, access_mode, created_at, updated_at
      FROM documents
      WHERE id = ?
    `);
    this.selectUserDocumentByKindStatement = client.sqlite.prepare(`
      SELECT id, owner_user_id, document_kind, title, access_mode, created_at, updated_at
      FROM documents
      WHERE owner_user_id = ? AND document_kind = ?
      LIMIT 1
    `);
    this.selectUserDocumentsStatement = client.sqlite.prepare(`
      SELECT id, owner_user_id, document_kind, title, access_mode, created_at, updated_at
      FROM documents
      WHERE owner_user_id = ? AND document_kind IN ('home-document', 'document')
      ORDER BY
        CASE document_kind WHEN 'home-document' THEN 0 ELSE 1 END,
        created_at ASC,
        id ASC
    `);
  }

  async getDocument(docId: string): Promise<RegisteredDocument | null> {
    const row = this.selectDocumentStatement.get(docId) as DocumentRow | undefined;
    return row ? toRegisteredDocument(row) : null;
  }

  async getUserDocumentByKind(
    ownerUserId: string,
    kind: Exclude<DocumentKind, 'document'>,
  ): Promise<RegisteredDocument | null> {
    const row = this.selectUserDocumentByKindStatement.get(ownerUserId, kind) as DocumentRow | undefined;
    return row ? toRegisteredDocument(row) : null;
  }

  async listUserDocuments(ownerUserId: string): Promise<RegisteredDocument[]> {
    const rows = this.selectUserDocumentsStatement.all(ownerUserId) as unknown as DocumentRow[];
    return rows.map(toRegisteredDocument);
  }

  async insertDocument({
    id,
    ownerUserId,
    kind = 'document',
    title,
  }: InsertDocumentInput): Promise<RegisteredDocument | null> {
    const now = Date.now();
    const result = this.insertDocumentStatement.run(
      id,
      ownerUserId,
      kind,
      title,
      now,
      now,
    );
    if (result.changes === 0) {
      return null;
    }
    const document = await this.getDocument(id);
    if (!document) {
      throw new Error(`Document registry row missing after insertDocument(${id}).`);
    }
    return document;
  }
}

export function createDocumentRegistry({
  client = createServerDatabaseClient(),
}: CreateDocumentRegistryOptions = {}): DocumentRegistry {
  return new SqliteDocumentRegistry(client);
}
