import { describe, expect, it, vi } from 'vitest';
import type { SourceServer } from '#domain/source-servers';
import type { CollectionSource, DocumentSource, UserDocument } from '#note-sdk';
import { createUserDataRootNote } from '#note-sdk';

function createFixture(): { documents: UserDocument[]; sourceServers: SourceServer[] } {
  return {
    documents: [
      {
        id: 'main',
        shareable: true,
        title: 'Main',
        access: [{
          documentId: 'main',
          email: 'bob@example.test',
          granteeUserId: 'bob',
          name: 'Bob',
        }],
      },
      { id: 'flat', shareable: false, title: 'Flat' },
    ],
    sourceServers: [{
      id: 'source',
      label: 'Source Server',
      baseUrl: 'https://source.example',
    }],
  };
}

describe('note SDK user-data core', () => {
  it('narrows notes by kind and throws on mismatches', () => {
    const { documents } = createFixture();
    const projected = createUserDataRootNote(documents).documents();
    const document = projected.children()[0]!;

    expect(projected.as('collection')).toBe(projected);
    expect(document.as('document')).toBe(document);
    expect(() => document.as('collection')).toThrow('expected "collection"');
  });

  it('lists documents through user-data collection traversal', () => {
    const { documents } = createFixture();
    const projected = createUserDataRootNote(documents).documents();

    expect(projected.byId('flat')?.text()).toBe('Flat');
    expect(projected.children().map((document) => ({
      id: document.id(),
      kind: document.kind(),
      shareable: document.shareable(),
      text: document.text(),
    }))).toEqual([
      { id: 'main', kind: 'document', shareable: true, text: 'Main' },
      { id: 'flat', kind: 'document', shareable: false, text: 'Flat' },
    ]);
  });

  it('lists documents through grouped document-source traversal', async () => {
    const fixture = createFixture();
    const localDocuments = {
      byId: (documentId: string) => fixture.documents.find((document) => document.id === documentId) ?? null,
      children: () => fixture.documents,
    };
    const remoteDocuments = {
      byId: (documentId: string) => documentId === 'remote'
        ? { id: 'remote', shareable: false, title: 'Remote' }
        : null,
      children: () => [{ id: 'remote', shareable: false, title: 'Remote' }],
    };
    const documentSources: CollectionSource<DocumentSource> = {
      byId: (sourceId) => documentSources.children().find((source) => source.id === sourceId) ?? null,
      children: () => [{
        baseUrl: null,
        documents: localDocuments,
        id: 'local',
        label: 'Current Server',
        local: true,
      }, {
        baseUrl: 'https://source.example',
        documents: remoteDocuments,
        id: 'source',
        label: 'Source Server',
        local: false,
      }],
    };
    const userData = createUserDataRootNote(fixture.documents, fixture.sourceServers, {
      documentSources,
    });

    expect(userData.documentSources().children().map((source) => ({
      documents: source.documents().children().map((document) => document.text()),
      id: source.id(),
      kind: source.kind(),
      local: source.local(),
      text: source.text(),
    }))).toEqual([
      {
        documents: ['Main', 'Flat'],
        id: 'local',
        kind: 'document-source',
        local: true,
        text: 'Current Server',
      },
      {
        documents: ['Remote'],
        id: 'source',
        kind: 'document-source',
        local: false,
        text: 'Source Server',
      },
    ]);
    const remoteSource = userData.documentSources().byId('source')!;
    expect(remoteSource.as('document-source')).toBe(remoteSource);
    await expect(remoteSource.documents().byId('remote')!
      .shareWith('bob@example.test')).rejects.toThrow('Document sharing is not available for this document.');
  });

  it('shares documents through document-level user-data handles', async () => {
    const { documents } = createFixture();
    const shareDocument = vi.fn(async (documentId: string, email: string) => ({
      documentId,
      email,
      granteeUserId: 'carol',
      name: 'Carol',
    }));
    const document = createUserDataRootNote(documents, { shareDocument })
      .documents()
      .byId('main')!;

    expect(document.access().children().map((access) => ({
      id: access.id(),
      kind: access.kind(),
      text: access.text(),
      email: access.email(),
      granteeUserId: access.granteeUserId(),
      name: access.name(),
    }))).toEqual([{
      id: 'bob',
      kind: 'document-access',
      text: 'Bob',
      email: 'bob@example.test',
      granteeUserId: 'bob',
      name: 'Bob',
    }]);

    const access = await document.shareWith('carol@example.test');

    expect(shareDocument).toHaveBeenCalledWith('main', 'carol@example.test');
    expect(access.text()).toBe('Carol');
  });

  it('uses the email as access text when the display name is empty', () => {
    const access = createUserDataRootNote([{
      access: [{
        documentId: 'main',
        email: 'reader@example.test',
        granteeUserId: 'reader',
        name: '',
      }],
      id: 'main',
      title: 'Main',
    }]).documents().byId('main')!.access().children()[0]!;

    expect(access.text()).toBe('reader@example.test');
  });

  it('lists source servers through user-data collection traversal', () => {
    const fixture = createFixture();
    const sourceServers = createUserDataRootNote(fixture.documents, fixture.sourceServers, {})
      .sourceServers();
    const sourceServer = sourceServers.byId('source')!;

    expect(sourceServers.kind()).toBe('collection');
    expect(sourceServers.children().map((server) => ({
      id: server.id(),
      kind: server.kind(),
      text: server.text(),
      baseUrl: server.baseUrl(),
    }))).toEqual([{
      id: 'source',
      kind: 'source-server',
      text: 'Source Server',
      baseUrl: 'https://source.example',
    }]);
    expect(sourceServer.as('source-server')).toBe(sourceServer);
  });
});
