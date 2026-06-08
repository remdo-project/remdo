import type { Selectable } from 'kysely';
import type { ServerDatabaseClient } from '#server/db/client';
import {
  DOCUMENT_ACCESS_MODES,
  DOCUMENT_ACCESS_STATUSES,
  DOCUMENT_KINDS,
} from '#server/db/schema';
import type {
  DocumentAccessMode,
  DocumentAccessStatus,
  DocumentAccessTable,
  DocumentKind,
  DocumentsTable,
} from '#server/db/schema';

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
  client: ServerDatabaseClient;
}

type DocumentRow = Selectable<DocumentsTable>;
type DocumentAccessRow = Selectable<DocumentAccessTable>;

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

function sortDocumentsForUser(ownerUserId: string, documents: RegisteredDocument[]): RegisteredDocument[] {
  return documents.toSorted((left, right) => {
    const leftOrder = left.kind === 'home-document' ? 0 : left.ownerUserId === ownerUserId ? 1 : 2;
    const rightOrder = right.kind === 'home-document' ? 0 : right.ownerUserId === ownerUserId ? 1 : 2;
    return leftOrder - rightOrder
      || left.createdAt.getTime() - right.createdAt.getTime()
      || left.id.localeCompare(right.id);
  });
}

class KyselyDocumentRegistry implements DocumentRegistry {
  constructor(private readonly client: ServerDatabaseClient) {}

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

    const row = await this.client.db
      .updateTable('document_access')
      .set({ status: 'approved' })
      .where('document_id', '=', documentId)
      .where('requester_user_id', '=', requesterUserId)
      .where('status', 'in', ['pending', 'revoked'])
      .returningAll()
      .executeTakeFirst();
    return row ? toDocumentAccess(row) : null;
  }

  async getApprovedAccessForRequester(
    documentId: string,
    requesterUserId: string,
  ): Promise<DocumentAccess | null> {
    const row = await this.client.db
      .selectFrom('document_access')
      .selectAll()
      .where('document_id', '=', documentId)
      .where('requester_user_id', '=', requesterUserId)
      .where('status', '=', 'approved')
      .limit(1)
      .executeTakeFirst();
    return row ? toDocumentAccess(row) : null;
  }

  async getDocument(docId: string): Promise<RegisteredDocument | null> {
    const row = await this.client.db
      .selectFrom('documents')
      .selectAll()
      .where('id', '=', docId)
      .executeTakeFirst();
    return row ? toRegisteredDocument(row) : null;
  }

  async getUserDocumentByKind(
    ownerUserId: string,
    kind: Exclude<DocumentKind, 'document'>,
  ): Promise<RegisteredDocument | null> {
    const row = await this.client.db
      .selectFrom('documents')
      .selectAll()
      .where('owner_user_id', '=', ownerUserId)
      .where('document_kind', '=', kind)
      .limit(1)
      .executeTakeFirst();
    return row ? toRegisteredDocument(row) : null;
  }

  async listUserDocuments(ownerUserId: string): Promise<RegisteredDocument[]> {
    const ownedRows = await this.client.db
      .selectFrom('documents')
      .selectAll()
      .where('owner_user_id', '=', ownerUserId)
      .where('document_kind', 'in', ['home-document', 'document'])
      .execute();
    const sharedRows = await this.client.db
      .selectFrom('document_access as access')
      .innerJoin('documents', 'documents.id', 'access.document_id')
      .select([
        'documents.id',
        'documents.owner_user_id',
        'documents.document_kind',
        'documents.title',
        'documents.access_mode',
        'documents.created_at',
        'documents.updated_at',
      ])
      .where('access.requester_user_id', '=', ownerUserId)
      .where('access.status', '=', 'approved')
      .where('documents.owner_user_id', '!=', ownerUserId)
      .where('documents.document_kind', '=', 'document')
      .where('documents.access_mode', '=', 'shareable')
      .execute();
    return sortDocumentsForUser(ownerUserId, [...ownedRows, ...sharedRows].map(toRegisteredDocument));
  }

  async listDocumentAccessForOwner(documentId: string, ownerUserId: string): Promise<DocumentAccess[]> {
    const rows = await this.client.db
      .selectFrom('document_access as access')
      .innerJoin('documents', 'documents.id', 'access.document_id')
      .select(['access.document_id', 'access.requester_user_id', 'access.status'])
      .where('access.document_id', '=', documentId)
      .where('documents.owner_user_id', '=', ownerUserId)
      .execute();
    return rows.map(toDocumentAccess);
  }

  async insertDocument({
    id,
    ownerUserId,
    kind = 'document',
    title,
  }: InsertDocumentInput): Promise<RegisteredDocument | null> {
    const now = Date.now();
    const row = await this.client.db
      .insertInto('documents')
      .values({
        access_mode: 'private',
        created_at: now,
        document_kind: kind,
        id,
        owner_user_id: ownerUserId,
        title,
        updated_at: now,
      })
      .onConflict((oc) => oc.doNothing())
      .returningAll()
      .executeTakeFirst();
    return row ? toRegisteredDocument(row) : null;
  }

  async revokeDocumentAccess(documentId: string, requesterUserId: string): Promise<boolean> {
    const result = await this.client.db
      .updateTable('document_access')
      .set({ status: 'revoked' })
      .where('document_id', '=', documentId)
      .where('requester_user_id', '=', requesterUserId)
      .where('status', '=', 'approved')
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async setDocumentAccessMode(
    docId: string,
    ownerUserId: string,
    accessMode: DocumentAccessMode,
  ): Promise<RegisteredDocument | null> {
    const row = await this.client.db
      .updateTable('documents')
      .set({
        access_mode: accessMode,
        updated_at: Date.now(),
      })
      .where('id', '=', docId)
      .where('owner_user_id', '=', ownerUserId)
      .returningAll()
      .executeTakeFirst();
    return row ? toRegisteredDocument(row) : null;
  }

  async upsertDocumentAccess(input: {
    documentId: string;
    requesterUserId: string;
  }): Promise<DocumentAccess> {
    const insertedRow = await this.client.db
      .insertInto('document_access')
      .values({
        document_id: input.documentId,
        requester_user_id: input.requesterUserId,
        status: 'pending',
      })
      .onConflict((oc) => oc.columns(['document_id', 'requester_user_id']).doNothing())
      .returningAll()
      .executeTakeFirst();
    if (insertedRow) {
      return toDocumentAccess(insertedRow);
    }

    const existingRow = await this.client.db
      .selectFrom('document_access')
      .selectAll()
      .where('document_id', '=', input.documentId)
      .where('requester_user_id', '=', input.requesterUserId)
      .executeTakeFirst();
    if (!existingRow) {
      throw new Error(`Document access missing after upsert for ${input.documentId}.`);
    }
    return toDocumentAccess(existingRow);
  }
}

export function createDocumentRegistry({
  client,
}: CreateDocumentRegistryOptions): DocumentRegistry {
  return new KyselyDocumentRegistry(client);
}
