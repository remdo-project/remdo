import { describe, expect, it } from 'vitest';
import { createUserDataRootNote } from '#note-sdk';
import type { DocumentSource, UserDocument } from '#note-sdk';
import { createObservableDocumentList } from '#tests';

describe('document sharing suggestions', () => {
  const target: UserDocument = {
    id: 'target', title: 'Target', shareable: true,
    access: [{ documentId: 'target', granteeUserId: 'existing', email: 'existing@example.test', name: 'Existing' }],
  };
  const outgoing: UserDocument = {
    id: 'outgoing', title: 'Outgoing', shareable: true,
    access: [
      { documentId: 'outgoing', granteeUserId: 'zoe', email: 'zoe@example.test', name: '' },
      { documentId: 'outgoing', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob' },
      { documentId: 'outgoing', granteeUserId: 'existing', email: 'existing@example.test', name: 'Existing' },
    ],
  };
  const incoming: UserDocument = {
    id: 'incoming', title: 'Incoming', shareable: false,
    sharedBy: { userId: 'aaron', email: 'aaron@example.test', name: 'Aaron' },
  };

  it('combines direct relationships, ranks outgoing first, and excludes existing recipients', () => {
    const mutual = { ...incoming, id: 'mutual', sharedBy: { userId: 'zoe', email: 'zoe@example.test', name: '' } };
    const data = createUserDataRootNote([target, incoming, mutual, outgoing, { ...outgoing, id: 'duplicate' }]);
    expect(data.getDocuments().getById('target')!.getSharingSuggestions()).toEqual([
      { userId: 'bob', email: 'bob@example.test', name: 'Bob' },
      { userId: 'zoe', email: 'zoe@example.test', name: '' },
      { userId: 'aaron', email: 'aaron@example.test', name: 'Aaron' },
    ]);
    expect(data.getDocuments().getById('incoming')!.getSharingSuggestions()).toEqual([]);
  });

  it('updates a held document reference when relationships disappear or become current recipients', () => {
    const { source, replace } = createObservableDocumentList([target, outgoing, incoming]);
    const note = createUserDataRootNote(source).getDocuments().getById('target')!;
    expect(note.getSharingSuggestions().map(({ userId }) => userId)).toEqual(['bob', 'zoe', 'aaron']);
    replace([target, incoming]);
    expect(note.getSharingSuggestions().map(({ userId }) => userId)).toEqual(['aaron']);
    replace([{ ...target, access: [{ documentId: 'target', granteeUserId: 'aaron', email: 'aaron@example.test', name: 'Aaron' }] }, incoming]);
    expect(note.getSharingSuggestions()).toEqual([]);
  });

  it('keeps contacts within the document source', () => {
    const local = [target, outgoing];
    const remote = [{ ...target, id: 'remote-target' }, incoming];
    const sources: DocumentSource[] = [
      { id: 'local', baseUrl: null, label: 'Current Server', local: true, documents: createObservableDocumentList(local).source },
      { id: 'remote', baseUrl: 'https://other.example.test', label: 'Other Server', local: false, documents: createObservableDocumentList(remote).source },
    ];
    const data = createUserDataRootNote(local, {
      documentSources: { getChildren: () => sources, getById: (id) => sources.find((source) => source.id === id) ?? null },
    });
    expect(data.getDocuments().getById('target')!.getSharingSuggestions().map(({ userId }) => userId)).toEqual(['bob', 'zoe']);
    expect(data.getDocumentSources().getById('remote')!.getDocuments().getById('remote-target')!.getSharingSuggestions())
      .toEqual([{ userId: 'aaron', email: 'aaron@example.test', name: 'Aaron' }]);
  });
});
