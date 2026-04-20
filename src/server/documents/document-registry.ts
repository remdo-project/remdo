import type { StatementSync } from 'node:sqlite';
import { createServerDatabaseClient } from '../db/client';
import type { ServerDatabaseClient } from '../db/client';
import { DOCUMENT_ACCESS_MODES } from '../db/schema';
import type { DocumentAccessMode } from '../db/schema';

export interface RegisteredDocument {
  id: string;
  accessMode: DocumentAccessMode;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentRegistry {
  ensureDocument: (docId: string) => Promise<RegisteredDocument>;
  getDocument: (docId: string) => Promise<RegisteredDocument | null>;
}

interface CreateDocumentRegistryOptions {
  client?: ServerDatabaseClient;
}

interface DocumentRow {
  access_mode: string;
  created_at: number;
  id: string;
  updated_at: number;
}

function parseAccessMode(value: string): DocumentAccessMode {
  if (DOCUMENT_ACCESS_MODES.includes(value as DocumentAccessMode)) {
    return value as DocumentAccessMode;
  }

  throw new TypeError(`Unsupported document access mode: ${value}`);
}

function toRegisteredDocument(row: DocumentRow): RegisteredDocument {
  return {
    id: row.id,
    accessMode: parseAccessMode(row.access_mode),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

class SqliteDocumentRegistry implements DocumentRegistry {
  private readonly insertDocumentStatement: StatementSync;
  private readonly selectDocumentStatement: StatementSync;

  constructor(client: ServerDatabaseClient) {
    this.insertDocumentStatement = client.sqlite.prepare(`
      INSERT INTO documents (id, access_mode, created_at, updated_at)
      VALUES (?, 'private', ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);
    this.selectDocumentStatement = client.sqlite.prepare(`
      SELECT id, access_mode, created_at, updated_at
      FROM documents
      WHERE id = ?
    `);
  }

  async getDocument(docId: string): Promise<RegisteredDocument | null> {
    const row = this.selectDocumentStatement.get(docId) as DocumentRow | undefined;
    return row ? toRegisteredDocument(row) : null;
  }

  async ensureDocument(docId: string): Promise<RegisteredDocument> {
    const now = Date.now();
    this.insertDocumentStatement.run(docId, now, now);
    const document = await this.getDocument(docId);
    if (!document) {
      throw new Error(`Document registry row missing after ensureDocument(${docId}).`);
    }
    return document;
  }
}

export function createDocumentRegistry({
  client = createServerDatabaseClient(),
}: CreateDocumentRegistryOptions = {}): DocumentRegistry {
  return new SqliteDocumentRegistry(client);
}
