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

  it('lists shared documents after owned documents', async () => {
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
    await registry.grantDocumentAccess('sharedDoc', 'owner-1', 'user-1');

    await expect(registry.listUserDocuments('user-1')).resolves.toMatchObject([
      { id: 'homeDoc', title: 'Home' },
      { id: 'ownedDoc', title: 'Owned' },
      { id: 'sharedDoc', title: 'Shared' },
    ]);
  });

  it('creates idempotent document access grants', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'shareDoc',
      ownerUserId: 'owner-1',
      title: 'Share',
    });

    await expect(registry.grantDocumentAccess('shareDoc', 'owner-1', 'user-1')).resolves.toEqual({
      documentId: 'shareDoc',
      granteeUserId: 'user-1',
    });
    await expect(registry.grantDocumentAccess('shareDoc', 'owner-1', 'user-1')).resolves.toEqual({
      documentId: 'shareDoc',
      granteeUserId: 'user-1',
    });
    await expect(registry.getDocumentAccessForGrantee('shareDoc', 'user-1')).resolves.toEqual({
      documentId: 'shareDoc',
      granteeUserId: 'user-1',
    });
  });

  it('grants document access only to document owners', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'shareDoc',
      ownerUserId: 'owner-1',
      title: 'Share',
    });

    await expect(registry.grantDocumentAccess('shareDoc', 'other-user', 'user-1')).resolves.toBeNull();
    await expect(registry.getDocumentAccessForGrantee('shareDoc', 'user-1')).resolves.toBeNull();
  });

  it('does not grant access to special documents', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'userData',
      kind: 'user-data-projection',
      ownerUserId: 'owner-1',
      title: 'User Data',
    });

    await expect(registry.grantDocumentAccess('userData', 'owner-1', 'user-1')).resolves.toBeNull();
  });

  it('lists document access grants for the owner only', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'shareDoc',
      ownerUserId: 'owner-1',
      title: 'Share',
    });
    await registry.grantDocumentAccess('shareDoc', 'owner-1', 'user-1');
    await registry.grantDocumentAccess('shareDoc', 'owner-1', 'user-2');

    await expect(registry.listDocumentAccessForOwner('shareDoc', 'owner-1')).resolves.toEqual([
      { documentId: 'shareDoc', granteeUserId: 'user-1' },
      { documentId: 'shareDoc', granteeUserId: 'user-2' },
    ]);
    await expect(registry.listDocumentAccessForOwner('shareDoc', 'other-user')).resolves.toEqual([]);
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

});
