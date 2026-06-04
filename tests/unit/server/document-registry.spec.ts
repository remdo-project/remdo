import { describe, expect, it } from 'vitest';
import { createTestResource } from '../_support/test-resource';
import { createDocumentRegistryHarness } from './_support/document-registry-harness';

const createHarness = createTestResource(createDocumentRegistryHarness);

function createRegistry() {
  return createHarness().registry;
}

describe('document registry', () => {
  it('inserts a missing document', async () => {
    const registry = createRegistry();

    const document = await registry.insertDocument({
      id: 'main',
      ownerUserId: 'user-1',
      title: 'main',
    });

    expect(document).toMatchObject({
      accessMode: 'private',
      id: 'main',
      kind: 'document',
      ownerUserId: 'user-1',
      title: 'main',
    });
    expect(document?.createdAt).toBeInstanceOf(Date);
    expect(document?.updatedAt).toBeInstanceOf(Date);
    await expect(registry.getDocument('main')).resolves.toEqual(document);
  });

  it('returns null when inserting an existing document id', async () => {
    const registry = createRegistry();

    const first = await registry.insertDocument({
      id: 'main',
      ownerUserId: 'user-1',
      title: 'main',
    });
    const second = await registry.insertDocument({
      id: 'main',
      ownerUserId: 'user-2',
      title: 'other',
    });

    expect(second).toBeNull();
    await expect(registry.getDocument('main')).resolves.toEqual(first);
  });

  it('inserted documents default to private', async () => {
    const registry = createRegistry();

    const document = await registry.insertDocument({
      id: 'notes',
      ownerUserId: 'user-1',
      title: 'Notes',
    });

    expect(document?.accessMode).toBe('private');
  });

  it('lists the home document before user-created documents', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'homeDoc',
      kind: 'home-document',
      ownerUserId: 'user-1',
      title: 'Home',
    });

    const first = await registry.insertDocument({
      id: 'firstDoc',
      ownerUserId: 'user-1',
      title: 'First',
    });
    const second = await registry.insertDocument({
      id: 'secondDoc',
      ownerUserId: 'user-1',
      title: 'Second',
    });

    expect(first?.title).toBe('First');
    expect(second?.title).toBe('Second');
    await expect(registry.listUserDocuments('user-1')).resolves.toMatchObject([
      { id: 'homeDoc', title: 'Home' },
      { id: 'firstDoc', title: 'First' },
      { id: 'secondDoc', title: 'Second' },
    ]);
  });

  it('excludes user data documents from the listed documents', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'userData',
      kind: 'user-data-projection',
      ownerUserId: 'user-1',
      title: 'User Data',
    });
    await registry.insertDocument({
      id: 'visibleDoc',
      ownerUserId: 'user-1',
      title: 'Visible',
    });

    await expect(registry.listUserDocuments('user-1')).resolves.toMatchObject([
      { id: 'visibleDoc', title: 'Visible' },
    ]);
  });

  it('lists approved shared documents after owned documents', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'homeDoc',
      kind: 'home-document',
      ownerUserId: 'user-1',
      title: 'Home',
    });
    await registry.insertDocument({
      id: 'ownedDoc',
      ownerUserId: 'user-1',
      title: 'Owned',
    });
    await registry.insertDocument({
      id: 'sharedDoc',
      ownerUserId: 'owner-1',
      title: 'Shared',
    });
    await registry.setDocumentAccessMode('sharedDoc', 'owner-1', 'shareable');
    await registry.upsertDocumentAccess({
      documentId: 'sharedDoc',
      requesterUserId: 'user-1',
    });
    await registry.approveDocumentAccess('sharedDoc', 'user-1', 'owner-1');

    await expect(registry.listUserDocuments('user-1')).resolves.toMatchObject([
      { id: 'homeDoc', title: 'Home' },
      { id: 'ownedDoc', title: 'Owned' },
      { id: 'sharedDoc', title: 'Shared' },
    ]);
  });

  it('hides approved shared documents after they are made private again', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'sharedDoc',
      ownerUserId: 'owner-1',
      title: 'Shared',
    });
    await registry.setDocumentAccessMode('sharedDoc', 'owner-1', 'shareable');
    await registry.upsertDocumentAccess({
      documentId: 'sharedDoc',
      requesterUserId: 'user-1',
    });
    await registry.approveDocumentAccess('sharedDoc', 'user-1', 'owner-1');

    await expect(registry.listUserDocuments('user-1')).resolves.toMatchObject([
      { id: 'sharedDoc', title: 'Shared' },
    ]);

    await registry.setDocumentAccessMode('sharedDoc', 'owner-1', 'private');

    await expect(registry.listUserDocuments('user-1')).resolves.toEqual([]);
  });

  it('updates access mode only for the document owner', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'shareDoc',
      ownerUserId: 'owner-1',
      title: 'Share',
    });

    await expect(registry.setDocumentAccessMode('shareDoc', 'other-user', 'shareable')).resolves.toBeNull();
    await expect(registry.setDocumentAccessMode('shareDoc', 'owner-1', 'shareable')).resolves.toMatchObject({
      accessMode: 'shareable',
      id: 'shareDoc',
    });
  });

  it('creates, approves, and revokes document access rows', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'shareDoc',
      ownerUserId: 'owner-1',
      title: 'Share',
    });
    await registry.setDocumentAccessMode('shareDoc', 'owner-1', 'shareable');

    await expect(registry.upsertDocumentAccess({
      documentId: 'shareDoc',
      requesterUserId: 'user-1',
    })).resolves.toEqual({
      documentId: 'shareDoc',
      requesterUserId: 'user-1',
      status: 'pending',
    });
    await expect(registry.getApprovedAccessForRequester('shareDoc', 'user-1')).resolves.toBeNull();
    await expect(registry.approveDocumentAccess('shareDoc', 'user-1', 'other-owner')).resolves.toBeNull();
    await expect(registry.approveDocumentAccess('shareDoc', 'user-1', 'owner-1')).resolves.toEqual({
      documentId: 'shareDoc',
      requesterUserId: 'user-1',
      status: 'approved',
    });
    await expect(registry.getApprovedAccessForRequester('shareDoc', 'user-1')).resolves.toMatchObject({
      status: 'approved',
    });
    await expect(registry.revokeDocumentAccess('shareDoc', 'user-1')).resolves.toBe(true);
    await expect(registry.getApprovedAccessForRequester('shareDoc', 'user-1')).resolves.toBeNull();
  });

  it('keeps revoked access closed to requester re-requests until owner approval', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'shareDoc',
      ownerUserId: 'owner-1',
      title: 'Share',
    });
    await registry.setDocumentAccessMode('shareDoc', 'owner-1', 'shareable');
    await registry.upsertDocumentAccess({
      documentId: 'shareDoc',
      requesterUserId: 'user-1',
    });
    await registry.approveDocumentAccess('shareDoc', 'user-1', 'owner-1');
    await registry.revokeDocumentAccess('shareDoc', 'user-1');

    await expect(registry.upsertDocumentAccess({
      documentId: 'shareDoc',
      requesterUserId: 'user-1',
    })).resolves.toEqual({
      documentId: 'shareDoc',
      requesterUserId: 'user-1',
      status: 'revoked',
    });
    await expect(registry.getApprovedAccessForRequester('shareDoc', 'user-1')).resolves.toBeNull();
    await expect(registry.approveDocumentAccess('shareDoc', 'user-1', 'owner-1')).resolves.toEqual({
      documentId: 'shareDoc',
      requesterUserId: 'user-1',
      status: 'approved',
    });
  });

  it('does not approve pending access after the document is made private', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'shareDoc',
      ownerUserId: 'owner-1',
      title: 'Share',
    });
    await registry.setDocumentAccessMode('shareDoc', 'owner-1', 'shareable');
    await registry.upsertDocumentAccess({
      documentId: 'shareDoc',
      requesterUserId: 'user-1',
    });
    await registry.setDocumentAccessMode('shareDoc', 'owner-1', 'private');

    await expect(registry.approveDocumentAccess('shareDoc', 'user-1', 'owner-1')).resolves.toBeNull();
    await expect(registry.getApprovedAccessForRequester('shareDoc', 'user-1')).resolves.toBeNull();
  });

  it('records the owner for inserted documents', async () => {
    const registry = createRegistry();

    const document = await registry.insertDocument({
      id: 'ownedNotes',
      ownerUserId: 'user-1',
      title: 'Owned Notes',
    });

    expect(document?.ownerUserId).toBe('user-1');
  });

  it('finds one special document by user and kind', async () => {
    const registry = createRegistry();

    await registry.insertDocument({
      id: 'userData1',
      kind: 'user-data-projection',
      ownerUserId: 'user-1',
      title: 'User Data',
    });

    await expect(registry.getUserDocumentByKind('user-1', 'user-data-projection')).resolves.toMatchObject({
      id: 'userData1',
      kind: 'user-data-projection',
      title: 'User Data',
    });
  });

  it('rejects unsupported stored document kinds', async () => {
    const registry = createRegistry();

    await expect(registry.insertDocument({
      id: 'invalidKind',
      kind: 'unknown-kind' as never,
      ownerUserId: 'user-1',
      title: 'Invalid',
    })).rejects.toThrow();
  });

  it('rejects unsupported stored access modes', () => {
    const harness = createHarness();

    const statement = harness.client.sqlite.prepare(`
      INSERT INTO documents (
        id,
        owner_user_id,
        document_kind,
        title,
        access_mode,
        created_at,
        updated_at
      )
      VALUES ('invalidAccess', 'user-1', 'document', 'Invalid', 'unknown-access', 0, 0)
    `);

    expect(() => statement.run()).toThrow();
  });
});
