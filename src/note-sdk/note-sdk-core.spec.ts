import { describe, expect, it, vi } from 'vitest';
import type { CollectionSource, DocumentSource, UserDocument } from '#note-sdk';
import { createUserDataRootNote, NoteUnavailableError } from '#note-sdk';
import { createObservableDocumentList } from '#tests';

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
    const projected = createUserDataRootNote(documents).documents;
    const document = projected.getChildren()[0]!;

    expect(projected.as('collection')).toBe(projected);
    expect(document.as('document')).toBe(document);
    expect(() => document.as('collection')).toThrow('expected "collection"');
  });

  it('lists documents through account collection membership', () => {
    const { documents } = createFixture();
    const projected = createUserDataRootNote(documents).documents;

    expect(projected.getById('flat')?.getText()).toBe('Flat');
    expect(projected.getChildren().map((document) => ({
      id: document.getId(),
      kind: document.getKind(),
      shareable: document.canShareWith(),
      text: document.getText(),
    }))).toEqual([
      { id: 'main', kind: 'document', shareable: false, text: 'Main' },
      { id: 'flat', kind: 'document', shareable: false, text: 'Flat' },
    ]);
  });

  it('reaches one source-owned document through named paths and aggregate membership', () => {
    const { documents } = createFixture();
    const userData = createUserDataRootNote(documents);
    const source = userData.sources.getById('local')!;
    const document = source.documents.getById('main')!;

    expect(userData.getParent()).toBeNull();
    expect(userData.getChildren()).toEqual([userData.sources, userData.documents]);
    expect(userData.sources.getParent()).toBe(userData);
    expect(userData.documents.getParent()).toBe(userData);
    expect(userData.sources.getChildren()).toEqual([source]);
    expect(source.getParent()).toBe(userData.sources);
    expect(source.getChildren()).toEqual([source.documents]);
    expect(source.documents.getParent()).toBe(source);
    expect(source.documents.getChildren()).toContain(document);
    expect(document.getParent()).toBe(source.documents);

    expect(userData.documents.getChildren()).toContain(document);
    expect(userData.documents.getById('main')).toBe(document);
    expect(userData.documentRef('main')).toBe(document);
    expect(document.getParent()).toBe(source.documents);
  });

  it('keeps document metadata and access readable without pretending its unopened content is empty', async () => {
    const { documents } = createFixture();
    const userData = createUserDataRootNote(documents);
    const document = userData.documents.getById('main')!;

    expect(document.getParent()).toBe(userData.sources.getById('local')!.documents);
    expect(document.getText()).toBe('Main');
    expect(document.getChildren()).toEqual([document.content, document.access]);
    expect(document.content.getParent()).toBe(document);
    expect(document.access.getParent()).toBe(document);
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
    expect(userData.documents.getById('unlisted')).toBeNull();
    expect(document.getText).toThrow(NoteUnavailableError);
    expect(document.canRename()).toBe(false);
    expect(document.getParent).toThrow(NoteUnavailableError);

    const renamed = await document.rename(' Renamed ');

    expect(renameDocument).toHaveBeenCalledWith('unlisted', ' Renamed ');
    expect(renamed.getId()).toBe('unlisted');
    expect(document.getText()).toBe('Renamed');
    expect(userData.documents.getById('unlisted')?.getText()).toBe('Renamed');
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

  it('observes a retained document through listing updates and releases its subscription', () => {
    const { documents } = createFixture();
    const { source, replace } = createObservableDocumentList(documents);
    const document = createUserDataRootNote(source).documents.getById('main')!;
    const titles: Array<string | null> = [];
    const unsubscribe = document.subscribe(() => {
      try {
        titles.push(document.getText());
      } catch (error) {
        if (!(error instanceof NoteUnavailableError)) throw error;
        titles.push(null);
      }
    });

    replace([{ ...documents[0]!, title: 'Quarterly plan' }]);
    expect(document.getText()).toBe('Quarterly plan');
    replace([]);
    expect(document.canShareWith()).toBe(false);
    unsubscribe();
    replace(documents);

    expect(titles).toEqual(['Quarterly plan', null]);
  });

  it('lists documents through grouped document-source traversal', async () => {
    const fixture = createFixture();
    const localDocuments = {
      getById: (documentId: string) => fixture.documents.find((document) => document.id === documentId) ?? null,
      getChildren: () => fixture.documents,
    };
    const remoteDocuments = {
      getById: (documentId: string) => documentId === 'remote'
        ? { id: 'remote', shareable: true, deletable: true, title: 'Remote' }
        : null,
      getChildren: () => [{ id: 'remote', shareable: true, deletable: true, title: 'Remote' }],
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
    const renameDocument = vi.fn(async () => {});
    const deleteDocument = vi.fn(async () => {});
    const shareDocument = vi.fn(async (documentId: string, email: string) => ({
      documentId, email, granteeUserId: 'bob', name: 'Bob',
    }));
    const userData = createUserDataRootNote(fixture.documents, {
      documentSources,
      renameDocument,
      deleteDocument,
      shareDocument,
    });

    expect(userData.sources.getChildren().map((source) => ({
      documents: source.documents.getChildren().map((document) => document.getText()),
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
    const remoteSource = userData.sources.getById('source')!;
    const remote = userData.documents.getById('remote')!;
    expect(remoteSource.as('document-source')).toBe(remoteSource);
    expect(userData.documents.getChildren().map(document => document.getText())).toEqual(['Main', 'Flat', 'Remote']);
    expect(remote).toBe(remoteSource.documents.getById('remote'));
    expect(remote.getParent()).toBe(remoteSource.documents);
    expect(remote.canRename()).toBe(false);
    expect(remote.canShareWith()).toBe(false);
    expect(remote.canDelete()).toBe(false);
    await expect(remote.shareWith('bob@example.test')).rejects.toThrow('Document sharing is not available for this document.');
    await expect(remote.rename('Must stay remote')).rejects.toThrow(/not available/);
    await expect(remote.delete()).rejects.toThrow(/not available/);
    expect(renameDocument).not.toHaveBeenCalled();
    expect(deleteDocument).not.toHaveBeenCalled();
    expect(shareDocument).not.toHaveBeenCalled();
  });

  it('refreshes retained source paths and aggregate observation when a source inventory changes', () => {
    const first = createObservableDocumentList([{ id: 'remote-doc', title: 'Before' }]);
    const replacement = createObservableDocumentList([{ id: 'remote-doc', title: 'After replacement' }]);
    let sourceRecord: DocumentSource | undefined = {
      id: 'remote', baseUrl: 'https://before.example.test', label: 'Before source', local: false, documents: first.source,
    };
    const listeners = new Set<() => void>();
    const inventory: CollectionSource<DocumentSource> = {
      getChildren: () => sourceRecord ? [sourceRecord] : [],
      getById: id => sourceRecord?.id === id ? sourceRecord : null,
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
    const replaceSource = (next: DocumentSource | undefined) => {
      sourceRecord = next;
      for (const listener of listeners) listener();
    };
    const userData = createUserDataRootNote([], { documentSources: inventory });
    const source = userData.sources.getById('remote')!;
    const document = userData.documents.getById('remote-doc')!;
    const retainedParent = document.getParent();
    const seen: string[][] = [];
    const stop = userData.documents.subscribe(() => {
      seen.push(userData.documents.getChildren().map(note => note.getText()));
    });

    replaceSource({
      id: 'remote', baseUrl: 'https://after.example.test', label: 'After source', local: false, documents: replacement.source,
    });

    expect(seen.at(-1)).toEqual(['After replacement']);
    expect(userData.sources.getById('remote')).toBe(source);
    expect(source.getText()).toBe('After source');
    expect(source.getBaseUrl()).toBe('https://after.example.test');
    expect(userData.documents.getById('remote-doc')).toBe(document);
    expect(document.getText()).toBe('After replacement');
    expect(document.getParent()).toBe(retainedParent);
    expect(retainedParent).toBe(source.documents);
    expect(retainedParent.getChildren()).toEqual([document]);

    const seenBeforeOldSourceUpdate = [...seen];
    first.replace([{ id: 'remote-doc', title: 'Stale detached source' }]);
    expect(seen).toEqual(seenBeforeOldSourceUpdate);
    replacement.replace([{ id: 'remote-doc', title: 'Current source update' }]);
    expect(seen.at(-1)).toEqual(['Current source update']);
    expect(document.getText()).toBe('Current source update');

    replaceSource(undefined);

    expect(seen.at(-1)).toEqual([]);
    expect(userData.documents.getChildren()).toEqual([]);
    expect(source.getText).toThrow(NoteUnavailableError);
    expect(source.getParent).toThrow(NoteUnavailableError);
    expect(retainedParent.getChildren).toThrow(NoteUnavailableError);
    expect(document.getParent).toThrow(NoteUnavailableError);
    expect(document.getText).toThrow(NoteUnavailableError);

    replaceSource({
      id: 'remote', baseUrl: 'https://restored.example.test', label: 'Restored', local: false, documents: replacement.source,
    });
    expect(document.getText()).toBe('Current source update');
    expect(document.getParent()).toBe(retainedParent);
    stop();
    stop();
    const seenAfterStop = [...seen];
    replacement.replace([{ id: 'remote-doc', title: 'No longer observed' }]);
    expect(seen).toEqual(seenAfterStop);
    expect(listeners.size).toBe(0);
  });

  it('keeps unknown ownership unavailable for parent reads and mutations until the source becomes known', async () => {
    const documents: UserDocument[] = [];
    const inventory: DocumentSource[] = [{
      id: 'remote', baseUrl: 'https://remote.example.test', label: 'Remote', local: false,
      documents: { getChildren: () => documents, getById: id => documents.find(document => document.id === id) ?? null },
    }];
    const renameDocument = vi.fn(async () => {});
    const userData = createUserDataRootNote([], {
      renameDocument,
      documentSources: {
        getChildren: () => inventory, getById: id => inventory.find(source => source.id === id) ?? null,
      },
    });
    const document = userData.documentRef('not-yet-listed');

    expect(document.getParent).toThrow(NoteUnavailableError);
    await expect(document.rename('No known owner')).rejects.toThrow(NoteUnavailableError);
    expect(renameDocument).not.toHaveBeenCalled();
    documents.push({ id: 'not-yet-listed', title: 'Discovered' });
    const parent = document.getParent();
    expect(parent).toBe(userData.sources.getById('remote')!.documents);
    expect(userData.documents.getById('not-yet-listed')).toBe(document);
    documents.pop();
    expect(document.getParent).toThrow(NoteUnavailableError);
    expect(document.getText).toThrow(NoteUnavailableError);
  });

  it('reads a moved document from its current source without retargeting its retained former parent', () => {
    const first: UserDocument[] = [{ id: 'moving-doc', title: 'Before move' }];
    const second: UserDocument[] = [];
    const sources: DocumentSource[] = [
      { id: 'first', baseUrl: 'https://first.example.test', label: 'First', local: false, documents: {
        getChildren: () => first, getById: id => first.find(document => document.id === id) ?? null,
      } },
      { id: 'second', baseUrl: 'https://second.example.test', label: 'Second', local: false, documents: {
        getChildren: () => second, getById: id => second.find(document => document.id === id) ?? null,
      } },
    ];
    const userData = createUserDataRootNote([], { documentSources: {
      getChildren: () => sources, getById: id => sources.find(source => source.id === id) ?? null,
    } });
    const document = userData.documents.getById('moving-doc')!;
    const previousParent = document.getParent();
    const nextParent = userData.sources.getById('second')!.documents;

    first.pop();
    second.push({ id: 'moving-doc', title: 'After move' });

    expect(userData.documentRef('moving-doc')).toBe(document);
    expect(document.getParent()).toBe(nextParent);
    expect(document.getText()).toBe('After move');
    expect(userData.documents.getById('moving-doc')).toBe(document);
    expect(nextParent.getChildren()).toEqual([document]);
    expect(previousParent).toBe(userData.sources.getById('first')!.documents);
    expect(previousParent.getChildren()).toEqual([]);
  });

  it('distinguishes unavailable aggregate inventories from empty results and observes recovery', () => {
    let registryAvailable = false;
    let remoteAvailable = true;
    const localDocuments = [{ id: 'local-doc', title: 'Local' }];
    let remoteDocuments = [{ id: 'remote-doc', title: 'Remote' }];
    const registryListeners = new Set<() => void>();
    const remoteListeners = new Set<() => void>();
    const readRemote = vi.fn(() => {
      if (!remoteAvailable) throw new NoteUnavailableError('remote/documents');
      return remoteDocuments;
    });
    const sources: DocumentSource[] = [{
      id: 'local', baseUrl: null, label: 'Current Server', local: true,
      documents: {
        getChildren: () => localDocuments,
        getById: id => localDocuments.find(document => document.id === id) ?? null,
      },
    }, {
      id: 'remote', baseUrl: 'https://remote.example.test', label: 'Remote', local: false,
      documents: {
        getChildren: readRemote,
        getById: id => readRemote().find(document => document.id === id) ?? null,
        subscribe: (listener) => { remoteListeners.add(listener); return () => { remoteListeners.delete(listener); }; },
      },
    }];
    const readRegistry = vi.fn(() => {
      if (!registryAvailable) throw new NoteUnavailableError('document-sources');
      return sources;
    });
    const userData = createUserDataRootNote(localDocuments, {
      renameDocument: async () => {},
      documentSources: {
        getChildren: readRegistry,
        getById: id => readRegistry().find(source => source.id === id) ?? null,
        subscribe: (listener) => { registryListeners.add(listener); return () => { registryListeners.delete(listener); }; },
      },
    });
    const aggregate = userData.documents;
    const sourceNotes = userData.sources;
    const document = userData.documentRef('local-doc');
    expect(readRegistry).not.toHaveBeenCalled();
    expect(readRemote).not.toHaveBeenCalled();
    expect(sourceNotes.getId()).toBe('document-sources');
    expect(document.getId()).toBe('local-doc');
    expect(aggregate.getChildren).toThrow(NoteUnavailableError);
    expect(() => aggregate.getById('missing')).toThrow(NoteUnavailableError);
    expect(document.canRename()).toBe(false);

    const seen: Array<string[] | null> = [];
    const stop = aggregate.subscribe(() => {
      try { seen.push(aggregate.getChildren().map(note => note.getText())); } catch (error) {
        if (!(error instanceof NoteUnavailableError)) throw error;
        seen.push(null);
      }
    });
    registryAvailable = true;
    for (const listener of registryListeners) listener();
    expect(seen).toEqual([['Local', 'Remote']]);
    expect(document.canRename()).toBe(true);

    remoteAvailable = false;
    for (const listener of remoteListeners) listener();
    expect(aggregate.getChildren).toThrow(NoteUnavailableError);
    expect(() => aggregate.getById('missing')).toThrow(NoteUnavailableError);
    expect(seen.at(-1)).toBeNull();

    remoteAvailable = true;
    remoteDocuments = [];
    localDocuments.length = 0;
    for (const listener of remoteListeners) listener();
    expect(aggregate.getChildren()).toEqual([]);
    expect(aggregate.getById('missing')).toBeNull();
    expect(seen).toEqual([['Local', 'Remote'], null, []]);
    stop();
  });

  it('releases document subscriptions when a synchronous notification refreshes the source inventory', () => {
    const registryListeners = new Set<() => void>();
    const registrations = new Map<number, () => void>();
    let nextRegistration = 0;
    const source: DocumentSource = {
      id: 'remote', baseUrl: 'https://remote.example.test', label: 'Before', local: false,
      documents: {
        getChildren: () => [],
        getById: () => null,
        subscribe: (listener) => {
          const registration = ++nextRegistration;
          registrations.set(registration, listener);
          listener();
          return () => { registrations.delete(registration); };
        },
      },
    };
    const userData = createUserDataRootNote([], { documentSources: {
      getChildren: () => [source],
      getById: id => id === source.id ? source : null,
      subscribe: (listener) => { registryListeners.add(listener); return () => { registryListeners.delete(listener); }; },
    } });
    const stop = userData.documents.subscribe(() => {
      if (source.label === 'After') return;
      source.label = 'After';
      for (const listener of registryListeners) listener();
    });

    expect(userData.sources.getById('remote')!.getText()).toBe('After');
    stop();
    expect(registrations.size).toBe(0);
    expect(registryListeners.size).toBe(0);
  });

  it('releases a newly discovered source when its first notification unsubscribes the aggregate', () => {
    const registryListeners = new Set<() => void>();
    const registrations = new Map<number, () => void>();
    let nextRegistration = 0;
    const sources: DocumentSource[] = [];
    const userData = createUserDataRootNote([], { documentSources: {
      getChildren: () => sources,
      getById: id => sources.find(source => source.id === id) ?? null,
      subscribe: (listener) => { registryListeners.add(listener); return () => { registryListeners.delete(listener); }; },
    } });
    const stop: () => void = userData.documents.subscribe(() => stop());
    sources.push({
      id: 'remote', baseUrl: 'https://remote.example.test', label: 'Remote', local: false,
      documents: {
        getChildren: () => [],
        getById: () => null,
        subscribe: (listener) => {
          const registration = ++nextRegistration;
          registrations.set(registration, listener);
          listener();
          return () => { registrations.delete(registration); };
        },
      },
    });

    for (const listener of registryListeners) listener();

    expect(nextRegistration).toBe(1);
    expect(registrations.size).toBe(0);
    expect(registryListeners.size).toBe(0);
  });

  it('shares documents through document-level user-data handles', async () => {
    const { documents } = createFixture();
    const shareDocument = vi.fn(async (documentId: string, email: string) => {
      const grant = { documentId, email, granteeUserId: 'carol', name: 'Carol' };
      const document = documents.find((candidate) => candidate.id === documentId)!;
      document.access = [...document.access!, grant];
      return grant;
    });
    const userData = createUserDataRootNote(documents, { shareDocument });
    const document = userData.documents.getById('main')!;

    expect(document.canShareWith()).toBe(true);
    expect(userData.documents.getById('flat')!.canShareWith()).toBe(false);
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
    }]).documents.getById('main')!.access.getChildren()[0]!;

    expect(access.getText()).toBe('reader@example.test');
  });

});
