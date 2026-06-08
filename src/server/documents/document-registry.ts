import type { Selectable } from 'kysely';
import type { ServerDatabaseClient } from '#server/db/client';
import { DOCUMENT_KINDS } from '#server/db/schema';
import type {
  DocumentAccessTable,
  DocumentKind,
  DocumentsTable,
} from '#server/db/schema';

export interface RegisteredDocument {
  id: string;
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
  granteeUserId: string;
}

export interface DocumentRegistry {
  getDocument: (docId: string) => Promise<RegisteredDocument | null>;
  getDocumentAccessForGrantee: (
    documentId: string,
    granteeUserId: string,
  ) => Promise<DocumentAccess | null>;
  getUserDocumentByKind: (
    ownerUserId: string,
    kind: Exclude<DocumentKind, 'document'>,
  ) => Promise<RegisteredDocument | null>;
  grantDocumentAccess: (
    documentId: string,
    ownerUserId: string,
    granteeUserId: string,
  ) => Promise<DocumentAccess | null>;
  insertDocument: (input: InsertDocumentInput) => Promise<RegisteredDocument | null>;
  listDocumentAccessForOwner: (documentId: string, ownerUserId: string) => Promise<DocumentAccess[]>;
  listUserDocuments: (ownerUserId: string) => Promise<RegisteredDocument[]>;
}

interface CreateDocumentRegistryOptions {
  client: ServerDatabaseClient;
}

type DocumentRow = Selectable<DocumentsTable>;
type DocumentAccessRow = Selectable<DocumentAccessTable>;

function parseDocumentKind(value: string): DocumentKind {
  if (DOCUMENT_KINDS.includes(value as DocumentKind)) {
    return value as DocumentKind;
  }

  throw new TypeError(`Unsupported document kind: ${value}`);
}

function toRegisteredDocument(row: DocumentRow): RegisteredDocument {
  return {
    id: row.id,
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
    granteeUserId: row.grantee_user_id,
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

  async getDocument(docId: string): Promise<RegisteredDocument | null> {
    const row = await this.client.db
      .selectFrom('documents')
      .selectAll()
      .where('id', '=', docId)
      .executeTakeFirst();
    return row ? toRegisteredDocument(row) : null;
  }

  async getDocumentAccessForGrantee(
    documentId: string,
    granteeUserId: string,
  ): Promise<DocumentAccess | null> {
    const row = await this.client.db
      .selectFrom('document_access')
      .selectAll()
      .where('document_id', '=', documentId)
      .where('grantee_user_id', '=', granteeUserId)
      .limit(1)
      .executeTakeFirst();
    return row ? toDocumentAccess(row) : null;
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

  async grantDocumentAccess(
    documentId: string,
    ownerUserId: string,
    granteeUserId: string,
  ): Promise<DocumentAccess | null> {
    const document = await this.getDocument(documentId);
    if (!document || document.ownerUserId !== ownerUserId || document.kind !== 'document') {
      return null;
    }

    const insertedRow = await this.client.db
      .insertInto('document_access')
      .values({
        document_id: documentId,
        grantee_user_id: granteeUserId,
      })
      .onConflict((oc) => oc.columns(['document_id', 'grantee_user_id']).doNothing())
      .returningAll()
      .executeTakeFirst();
    if (insertedRow) {
      return toDocumentAccess(insertedRow);
    }

    return this.getDocumentAccessForGrantee(documentId, granteeUserId);
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

  async listDocumentAccessForOwner(documentId: string, ownerUserId: string): Promise<DocumentAccess[]> {
    const rows = await this.client.db
      .selectFrom('document_access as access')
      .innerJoin('documents', 'documents.id', 'access.document_id')
      .select(['access.document_id', 'access.grantee_user_id'])
      .where('access.document_id', '=', documentId)
      .where('documents.owner_user_id', '=', ownerUserId)
      .execute();
    return rows.map(toDocumentAccess);
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
        'documents.created_at',
        'documents.updated_at',
      ])
      .where('access.grantee_user_id', '=', ownerUserId)
      .where('documents.owner_user_id', '!=', ownerUserId)
      .where('documents.document_kind', '=', 'document')
      .execute();
    return sortDocumentsForUser(ownerUserId, [...ownedRows, ...sharedRows].map(toRegisteredDocument));
  }
}

export function createDocumentRegistry({
  client,
}: CreateDocumentRegistryOptions): DocumentRegistry {
  return new KyselyDocumentRegistry(client);
}
