import { describe, expect, it, vi } from 'vitest';
import type { CollectionSource, DocumentSource, UserDocument } from '#note-sdk';
import { createUserDataRootNote, NoteUnavailableError } from '#note-sdk';

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

  it('keeps document metadata and access readable without pretending its unopened content is empty', async () => {
    const { documents } = createFixture();
    const document = createUserDataRootNote(documents).getDocuments().getById('main')!;

    expect(document.getText()).toBe('Main');
    expect(document.access.getChildren().map((access) => access.getEmail())).toEqual(['bob@example.test']);
    expect(document.access.getChildren()[0]!.getParent()).toBe(document.access);
    expect(document.content.getChildren).toThrow(NoteUnavailableError);
    expect(document.content.getChildListType).toThrow(NoteUnavailableError);
    expect(() => document.content.getById('unknown')).toThrow(NoteUnavailableError);
    await expect(document.content.appendChildren([{ text: 'Child' }])).rejects.toBeInstanceOf(NoteUnavailableError);
  });

  it('addresses an unlisted document without acquiring data and lets its source decide a rename', async () => {
    const documents: UserDocument[] = [];
    const listeners = new Set<() => void>();
    const source: CollectionSource<UserDocument> = {
      getChildren: vi.fn(() => documents),
      getById: vi.fn((id) => documents.find((document) => document.id === id) ?? null),
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
    const renameDocument = vi.fn(async (id: string, title: string) => {
      documents.push({ id, title: title.trim() });
      for (const listener of listeners) listener();
    });
    const userData = createUserDataRootNote(source, { renameDocument });
    const document = userData.documentRef('unlisted');

    expect(document.getId()).toBe('unlisted');
    expect(source.getChildren).not.toHaveBeenCalled();
    expect(source.getById).not.toHaveBeenCalled();
    expect(userData.getDocuments().getById('unlisted')).toBeNull();
    expect(document.getText).toThrow(NoteUnavailableError);
    expect(document.canRename()).toBe(false);

    const renamed = await document.rename(' Renamed ');

    expect(renameDocument).toHaveBeenCalledWith('unlisted', ' Renamed ');
    expect(renamed.getId()).toBe('unlisted');
    expect(document.getText()).toBe('Renamed');
    expect(userData.getDocuments().getById('unlisted')?.getText()).toBe('Renamed');
    expect(source.getChildren).not.toHaveBeenCalled();
  });

  it('reads refreshed grants through retained access and grant references', () => {
    const { documents } = createFixture();
    const document = createUserDataRootNote(documents).documentRef('main');
    const access = document.access;
    const bob = access.getById('main/access/bob')!;

    expect(access.getChildren().map((grant) => grant.getEmail())).toEqual(['bob@example.test']);

    documents[0] = {
      ...documents[0]!,
      access: [{ documentId: 'main', granteeUserId: 'bob', email: 'robert@example.test', name: 'Robert' }],
    };

    expect(bob.getText()).toBe('Robert');
    expect(bob.getEmail()).toBe('robert@example.test');

    documents[0] = {
      ...documents[0],
      access: [{ documentId: 'main', granteeUserId: 'carol', email: 'carol@example.test', name: 'Carol' }],
    };

    expect(access.getChildren().map((grant) => grant.getEmail())).toEqual(['carol@example.test']);
    expect(access.getById('main/access/bob')).toBeNull();
    expect(access.getById('main/access/carol')?.getText()).toBe('Carol');
    expect(bob.getText).toThrow(NoteUnavailableError);

    documents.shift();

    expect(access.getChildren).toThrow(NoteUnavailableError);
    expect(() => access.getById('main/access/carol')).toThrow(NoteUnavailableError);
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
    const shareDocument = vi.fn(async (documentId: string, email: string) => {
      const grant = { documentId, email, granteeUserId: 'carol', name: 'Carol' };
      const document = documents.find((candidate) => candidate.id === documentId)!;
      document.access = [...document.access!, grant];
      return grant;
    });
    const document = createUserDataRootNote(documents, { shareDocument })
      .getDocuments()
      .getById('main')!;

    expect(document.access.getChildren().map((access) => ({
      id: access.getId(),
      kind: access.getKind(),
      text: access.getText(),
      email: access.getEmail(),
      granteeUserId: access.getGranteeUserId(),
      name: access.getName(),
    }))).toEqual([{
      id: 'main/access/bob',
      kind: 'document-access',
      text: 'Bob',
      email: 'bob@example.test',
      granteeUserId: 'bob',
      name: 'Bob',
    }]);

    const access = await document.shareWith('carol@example.test');

    expect(shareDocument).toHaveBeenCalledWith('main', 'carol@example.test');
    expect(access.getText()).toBe('Carol');
    expect(access.getId()).toBe('main/access/carol');
    expect(access.getParent()).toBe(document.access);
    expect(document.access.getById(access.getId())?.getText()).toBe('Carol');
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
    }]).getDocuments().getById('main')!.access.getChildren()[0]!;

    expect(access.getText()).toBe('reader@example.test');
  });

});
