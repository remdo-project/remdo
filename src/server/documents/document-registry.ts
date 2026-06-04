import type { StatementSync } from 'node:sqlite';
import { createServerDatabaseClient } from '@/server/db/client';
import type { ServerDatabaseClient } from '@/server/db/client';
import {
  DOCUMENT_ACCESS_MODES,
  DOCUMENT_ACCESS_STATUSES,
  DOCUMENT_KINDS,
} from '@/server/db/schema';
import type {
  DocumentAccessMode,
  DocumentAccessStatus,
  DocumentKind,
} from '@/server/db/schema';

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

export interface DocumentAccess {
  documentId: string;
  requesterUserId: string;
  status: DocumentAccessStatus;
}

export interface DocumentRegistry {
  approveDocumentAccess: (
    documentId: string,
    requesterUserId: string,
    ownerUserId: string,
  ) => Promise<DocumentAccess | null>;
  getApprovedAccessForRequester: (
    documentId: string,
    requesterUserId: string,
  ) => Promise<DocumentAccess | null>;
  getDocument: (docId: string) => Promise<RegisteredDocument | null>;
  getUserDocumentByKind: (
    ownerUserId: string,
    kind: Exclude<DocumentKind, 'document'>,
  ) => Promise<RegisteredDocument | null>;
  insertDocument: (input: InsertDocumentInput) => Promise<RegisteredDocument | null>;
  listDocumentAccessForOwner: (documentId: string, ownerUserId: string) => Promise<DocumentAccess[]>;
  listUserDocuments: (ownerUserId: string) => Promise<RegisteredDocument[]>;
  revokeDocumentAccess: (documentId: string, requesterUserId: string) => Promise<boolean>;
  setDocumentAccessMode: (
    docId: string,
    ownerUserId: string,
    accessMode: DocumentAccessMode,
  ) => Promise<RegisteredDocument | null>;
  upsertDocumentAccess: (input: {
    documentId: string;
    requesterUserId: string;
  }) => Promise<DocumentAccess>;
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

interface DocumentAccessRow {
  document_id: string;
  requester_user_id: string;
  status: string;
}

function parseAccessMode(value: string): DocumentAccessMode {
  if (DOCUMENT_ACCESS_MODES.includes(value as DocumentAccessMode)) {
    return value as DocumentAccessMode;
  }

  throw new TypeError(`Unsupported document access mode: ${value}`);
}

function parseDocumentAccessStatus(value: string): DocumentAccessStatus {
  if (DOCUMENT_ACCESS_STATUSES.includes(value as DocumentAccessStatus)) {
    return value as DocumentAccessStatus;
  }

  throw new TypeError(`Unsupported document access status: ${value}`);
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

function toDocumentAccess(row: DocumentAccessRow): DocumentAccess {
  return {
    documentId: row.document_id,
    requesterUserId: row.requester_user_id,
    status: parseDocumentAccessStatus(row.status),
  };
}

class SqliteDocumentRegistry implements DocumentRegistry {
  private readonly approveDocumentAccessStatement: StatementSync;
  private readonly insertDocumentStatement: StatementSync;
  private readonly insertDocumentAccessStatement: StatementSync;
  private readonly revokeDocumentAccessStatement: StatementSync;
  private readonly selectApprovedAccessForRequesterStatement: StatementSync;
  private readonly selectDocumentAccessByRequesterStatement: StatementSync;
  private readonly selectDocumentAccessForOwnerStatement: StatementSync;
  private readonly selectDocumentStatement: StatementSync;
  private readonly selectUserDocumentByKindStatement: StatementSync;
  private readonly selectUserDocumentsStatement: StatementSync;
  private readonly setDocumentAccessModeStatement: StatementSync;

  constructor(client: ServerDatabaseClient) {
    this.approveDocumentAccessStatement = client.sqlite.prepare(`
      UPDATE document_access
      SET status = 'approved'
      WHERE document_id = ? AND requester_user_id = ? AND status IN ('pending', 'revoked')
    `);
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
    this.insertDocumentAccessStatement = client.sqlite.prepare(`
      INSERT INTO document_access (
        document_id,
        requester_user_id,
        status
      )
      VALUES (?, ?, 'pending')
      ON CONFLICT(document_id, requester_user_id) DO NOTHING
    `);
    this.revokeDocumentAccessStatement = client.sqlite.prepare(`
      UPDATE document_access
      SET status = 'revoked'
      WHERE document_id = ? AND requester_user_id = ? AND status = 'approved'
    `);
    this.selectApprovedAccessForRequesterStatement = client.sqlite.prepare(`
      SELECT document_id, requester_user_id, status
      FROM document_access
      WHERE document_id = ? AND requester_user_id = ? AND status = 'approved'
      LIMIT 1
    `);
    this.selectDocumentAccessByRequesterStatement = client.sqlite.prepare(`
      SELECT document_id, requester_user_id, status
      FROM document_access
      WHERE document_id = ? AND requester_user_id = ?
      LIMIT 1
    `);
    this.selectDocumentAccessForOwnerStatement = client.sqlite.prepare(`
      SELECT access.document_id, access.requester_user_id, access.status
      FROM document_access AS access
      INNER JOIN documents ON documents.id = access.document_id
      WHERE access.document_id = ? AND documents.owner_user_id = ?
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
      FROM (
        SELECT
          id,
          owner_user_id,
          document_kind,
          title,
          access_mode,
          created_at,
          updated_at,
          CASE document_kind WHEN 'home-document' THEN 0 ELSE 1 END AS sort_order
        FROM documents
        WHERE owner_user_id = ? AND document_kind IN ('home-document', 'document')
        UNION ALL
        SELECT
          documents.id,
          documents.owner_user_id,
          documents.document_kind,
          documents.title,
          documents.access_mode,
          documents.created_at,
          documents.updated_at,
          2 AS sort_order
        FROM document_access AS access
        INNER JOIN documents ON documents.id = access.document_id
        WHERE access.requester_user_id = ?
          AND access.status = 'approved'
          AND documents.owner_user_id != ?
          AND documents.document_kind = 'document'
          AND documents.access_mode = 'shareable'
      )
      ORDER BY sort_order ASC, created_at ASC, id ASC
    `);
    this.setDocumentAccessModeStatement = client.sqlite.prepare(`
      UPDATE documents
      SET access_mode = ?, updated_at = ?
      WHERE id = ? AND owner_user_id = ?
    `);
  }

  async approveDocumentAccess(
    documentId: string,
    requesterUserId: string,
    ownerUserId: string,
  ): Promise<DocumentAccess | null> {
    const document = await this.getDocument(documentId);
    if (
      !document
      || document.ownerUserId !== ownerUserId
      || document.kind !== 'document'
      || document.accessMode !== 'shareable'
    ) {
      return null;
    }
    const result = this.approveDocumentAccessStatement.run(documentId, requesterUserId);
    if (result.changes === 0) {
      return null;
    }
    const row = this.selectDocumentAccessByRequesterStatement.get(
      documentId,
      requesterUserId,
    ) as DocumentAccessRow | undefined;
    if (!row) {
      throw new Error(`Document access missing after approving ${requesterUserId}.`);
    }
    return toDocumentAccess(row);
  }

  async getApprovedAccessForRequester(
    documentId: string,
    requesterUserId: string,
  ): Promise<DocumentAccess | null> {
    const row = this.selectApprovedAccessForRequesterStatement.get(
      documentId,
      requesterUserId,
    ) as DocumentAccessRow | undefined;
    return row ? toDocumentAccess(row) : null;
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
    const rows = this.selectUserDocumentsStatement.all(ownerUserId, ownerUserId, ownerUserId) as unknown as DocumentRow[];
    return rows.map(toRegisteredDocument);
  }

  async listDocumentAccessForOwner(documentId: string, ownerUserId: string): Promise<DocumentAccess[]> {
    const rows = this.selectDocumentAccessForOwnerStatement.all(
      documentId,
      ownerUserId,
    ) as unknown as DocumentAccessRow[];
    return rows.map(toDocumentAccess);
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

  async revokeDocumentAccess(documentId: string, requesterUserId: string): Promise<boolean> {
    const result = this.revokeDocumentAccessStatement.run(documentId, requesterUserId);
    return result.changes > 0;
  }

  async setDocumentAccessMode(
    docId: string,
    ownerUserId: string,
    accessMode: DocumentAccessMode,
  ): Promise<RegisteredDocument | null> {
    const result = this.setDocumentAccessModeStatement.run(accessMode, Date.now(), docId, ownerUserId);
    if (result.changes === 0) {
      return null;
    }
    return this.getDocument(docId);
  }

  async upsertDocumentAccess(input: {
    documentId: string;
    requesterUserId: string;
  }): Promise<DocumentAccess> {
    this.insertDocumentAccessStatement.run(input.documentId, input.requesterUserId);
    const row = this.selectDocumentAccessByRequesterStatement.get(
      input.documentId,
      input.requesterUserId,
    ) as DocumentAccessRow | undefined;
    if (!row) {
      throw new Error(`Document access missing after upsert for ${input.documentId}.`);
    }
    return toDocumentAccess(row);
  }
}

export function createDocumentRegistry({
  client = createServerDatabaseClient(),
}: CreateDocumentRegistryOptions = {}): DocumentRegistry {
  return new SqliteDocumentRegistry(client);
}
