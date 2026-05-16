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
      title: 'Main',
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
      { id: 'homeDoc', title: 'Main' },
      { id: 'firstDoc', title: 'First' },
      { id: 'secondDoc', title: 'Second' },
    ]);
  });

  it('excludes user config documents from the listed documents', async () => {
    const registry = createRegistry();
    await registry.insertDocument({
      id: 'userConfig',
      kind: 'user-config',
      ownerUserId: 'user-1',
      title: 'User Config',
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
      id: 'userConfig1',
      kind: 'user-config',
      ownerUserId: 'user-1',
      title: 'User Config',
    });

    await expect(registry.getUserDocumentByKind('user-1', 'user-config')).resolves.toMatchObject({
      id: 'userConfig1',
      kind: 'user-config',
      title: 'User Config',
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
