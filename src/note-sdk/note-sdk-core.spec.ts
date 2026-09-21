import { describe, expect, it, vi } from 'vitest';
import type { CollectionSource, DocumentSource, UserDocument } from '#note-sdk';
import { createUserDataRootNote } from '#note-sdk';

function createFixture(): { documents: UserDocument[] } {
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
  };
}

describe('note SDK user-data core', () => {
  it('narrows notes by kind and throws on mismatches', () => {
    const { documents } = createFixture();
    const projected = createUserDataRootNote(documents).getDocuments();
    const document = projected.getChildren()[0]!;

    expect(projected.as('collection')).toBe(projected);
    expect(document.as('document')).toBe(document);
    expect(() => document.as('collection')).toThrow('expected "collection"');
  });

  it('lists documents through user-data collection traversal', () => {
    const { documents } = createFixture();
    const projected = createUserDataRootNote(documents).getDocuments();

    expect(projected.getById('flat')?.getText()).toBe('Flat');
    expect(projected.getChildren().map((document) => ({
      id: document.getId(),
      kind: document.getKind(),
      shareable: document.canShareWith(),
      text: document.getText(),
    }))).toEqual([
      { id: 'main', kind: 'document', shareable: true, text: 'Main' },
      { id: 'flat', kind: 'document', shareable: false, text: 'Flat' },
    ]);
  });

  it('lists documents through grouped document-source traversal', async () => {
    const fixture = createFixture();
    const localDocuments = {
      getById: (documentId: string) => fixture.documents.find((document) => document.id === documentId) ?? null,
      getChildren: () => fixture.documents,
    };
    const remoteDocuments = {
      getById: (documentId: string) => documentId === 'remote'
        ? { id: 'remote', shareable: false, title: 'Remote' }
        : null,
      getChildren: () => [{ id: 'remote', shareable: false, title: 'Remote' }],
    };
    const documentSources: CollectionSource<DocumentSource> = {
      getById: (sourceId) => documentSources.getChildren().find((source) => source.id === sourceId) ?? null,
      getChildren: () => [{
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
    const userData = createUserDataRootNote(fixture.documents, {
      documentSources,
    });

    expect(userData.getDocumentSources().getChildren().map((source) => ({
      documents: source.getDocuments().getChildren().map((document) => document.getText()),
      id: source.getId(),
      kind: source.getKind(),
      local: source.getLocal(),
      text: source.getText(),
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
    const remoteSource = userData.getDocumentSources().getById('source')!;
    expect(remoteSource.as('document-source')).toBe(remoteSource);
    await expect(remoteSource.getDocuments().getById('remote')!
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
      .getDocuments()
      .getById('main')!;

    expect(document.getAccess().getChildren().map((access) => ({
      id: access.getId(),
      kind: access.getKind(),
      text: access.getText(),
      email: access.getEmail(),
      granteeUserId: access.getGranteeUserId(),
      name: access.getName(),
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
    expect(access.getText()).toBe('Carol');
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
    }]).getDocuments().getById('main')!.getAccess().getChildren()[0]!;

    expect(access.getText()).toBe('reader@example.test');
  });

});
