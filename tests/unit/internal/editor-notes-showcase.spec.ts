/**
 * Temporary SDK scratchpad.
 *
 * This file is intentionally used to prototype and discuss SDK shape changes.
 * It is not a normative test suite and should not be used for test coverage
 * planning or quality gates beyond basic safety checks.
 *
 * Proper unit/integration suites remain the source of truth; this file is
 * expected to be removed once the SDK API reaches a stable/final shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTestUserData,
  meta,
  placeCaretAtNote,
  resetTestUserData,
  TEST_USER_DATA_DOCUMENT,
} from '#tests';
import { createLexicalEditorNotes } from '#client/editor/note-sdk-adapters';
import { createUserDataRootNote } from '#note-sdk';

describe('editor notes showcase', () => {
  beforeEach(() => {
    resetTestUserData();
  });

  it(
    'walks through the main sdk workflow on a flat fixture (select, read, create, place, indent/outdent, move, delete)',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2');
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const note2 = sdk.note('note2');

      remdo.validate(() => {
        expect(sdk.docId()).toBe(remdo.getCollabDocId());

        const selection = sdk.selection();
        if (selection.kind !== 'caret') {
          throw new Error(`Expected caret selection, got ${selection.kind}`);
        }
        expect(selection.range).toEqual({ start: 'note2', end: 'note2' });
        expect(note2.text()).toBe('note2');
      });

      let topNoteId = '';
      await remdo.mutate(() => {
        const topNote = sdk.currentDocument().create({ after: 'note2' }, 'sdk note');
        topNoteId = topNote.id();
        sdk.note('note1').create('child note');
        sdk.place({ start: 'note2', end: 'note2' }, { before: 'note1' });
      });

      expect(remdo).toMatchOutline([
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note1', text: 'note1', children: [{ noteId: null, text: 'child note' }] },
        { noteId: null, text: 'sdk note' },
        { noteId: 'note3', text: 'note3' },
      ]);

      remdo.validate(() => {
        expect(sdk.note('note1').children().map((child) => child.text())).toEqual(['child note']);
      });

      await remdo.mutate(() => {
        sdk.indent({ start: topNoteId, end: topNoteId });
        sdk.outdent({ start: topNoteId, end: topNoteId });
        sdk.moveDown({ start: 'note2', end: 'note2' });
        sdk.moveUp({ start: 'note2', end: 'note2' });
        sdk.delete({ start: 'note3', end: 'note3' });
      });

      expect(remdo).toMatchOutline([
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note1', text: 'note1', children: [{ noteId: null, text: 'child note' }] },
        { noteId: null, text: 'sdk note' },
      ]);
    }
  );

  it(
    'lists and creates documents through a projected user-data collection',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note1');
      const userData = getTestUserData();
      const documents = userData.documents();

      remdo.validate(() => {
        expect(documents.id()).toBe('user-documents');
        expect(documents.kind()).toBe('collection');
        expect(documents.byId(TEST_USER_DATA_DOCUMENT.id)?.text()).toBe(TEST_USER_DATA_DOCUMENT.title);
        expect(documents.children().map((document) => ({
          id: document.id(),
          text: document.text(),
        }))).toEqual([
          { id: TEST_USER_DATA_DOCUMENT.id, text: TEST_USER_DATA_DOCUMENT.title },
        ]);
      });

      const createdDocument = await documents.create('New Document');

      remdo.validate(() => {
        expect(createdDocument.kind()).toBe('document');
        expect(documents.children().map((document) => ({
          id: document.id(),
          text: document.text(),
        }))).toEqual([
          { id: TEST_USER_DATA_DOCUMENT.id, text: TEST_USER_DATA_DOCUMENT.title },
          { id: createdDocument.id(), text: 'New Document' },
        ]);
      });
    }
  );

  it('manages sharing through document-level user-data handles', async () => {
    const shareDocument = vi.fn(async (documentId: string, email: string) => ({
      documentId,
      email,
      granteeUserId: 'bob',
      name: 'Bob',
    }));
    const userData = createUserDataRootNote([{
      id: 'doc',
      title: 'Document',
      access: [{
        documentId: 'doc',
        email: 'alice@example.test',
        granteeUserId: 'alice',
        name: 'Alice',
      }],
    }], {
      shareDocument,
    });

    const document = userData.documents().byId('doc')!;
    const access = document.access();

    expect(access.kind()).toBe('collection');
    expect(access.children().map((person) => ({
      id: person.id(),
      text: person.text(),
      email: person.email(),
    }))).toEqual([{
      id: 'alice',
      text: 'Alice',
      email: 'alice@example.test',
    }]);

    const shared = await document.shareWith('bob@example.test');

    expect(shareDocument).toHaveBeenCalledWith('doc', 'bob@example.test');
    expect(shared.kind()).toBe('document-access');
    expect(shared.text()).toBe('Bob');
  });

  it('reads source servers through the same projected collection shape', async () => {
    const linkSourceServer = vi.fn(async () => {});
    const userData = createUserDataRootNote([], [{
      id: 'source',
      label: 'Source Server',
      baseUrl: 'https://source.example',
      linked: false,
    }], {
      linkSourceServer,
    });

    const sourceServers = userData.sourceServers();
    const source = sourceServers.byId('source')!;

    expect(sourceServers.id()).toBe('source-servers');
    expect(sourceServers.kind()).toBe('collection');
    expect(sourceServers.children().map((server) => ({
      id: server.id(),
      text: server.text(),
      baseUrl: server.baseUrl(),
      linked: server.linked(),
    }))).toEqual([{
      id: 'source',
      text: 'Source Server',
      baseUrl: 'https://source.example',
      linked: false,
    }]);

    await source.link();

    expect(linkSourceServer).toHaveBeenCalledWith('source');
  });

  it('reads grouped document sources as collection notes', () => {
    const localDocuments = [{
      id: 'localDoc',
      title: 'Local Document',
    }];
    const remoteDocuments = [{
      id: 'sourceDoc',
      title: 'Source Document',
    }];
    const userData = createUserDataRootNote(localDocuments, [], {
      documentSources: {
        byId: (sourceId) => sourceId === 'source'
          ? {
              baseUrl: 'https://source.example',
              documents: {
                byId: (documentId) => remoteDocuments.find((document) => document.id === documentId) ?? null,
                children: () => remoteDocuments,
              },
              id: 'source',
              label: 'Source Server',
              local: false,
            }
          : null,
        children: () => [{
          baseUrl: null,
          documents: {
            byId: (documentId) => localDocuments.find((document) => document.id === documentId) ?? null,
            children: () => localDocuments,
          },
          id: 'local',
          label: 'Current Server',
          local: true,
        }, {
          baseUrl: 'https://source.example',
          documents: {
            byId: (documentId) => remoteDocuments.find((document) => document.id === documentId) ?? null,
            children: () => remoteDocuments,
          },
          id: 'source',
          label: 'Source Server',
          local: false,
        }],
      },
    });

    expect(userData.documentSources().children().map((source) => ({
      documents: source.documents().children().map((document) => document.text()),
      id: source.id(),
      text: source.text(),
    }))).toEqual([
      { id: 'local', text: 'Current Server', documents: ['Local Document'] },
      { id: 'source', text: 'Source Server', documents: ['Source Document'] },
    ]);
  });

  it(
    'shows explicit note narrowing with as(kind)',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note1');
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const userData = getTestUserData();

      remdo.validate(() => {
        const documents = userData.documents();
        const firstDocument = documents.children()[0]!;
        const note1 = sdk.note('note1').as('editor-note');

        expect(userData.kind()).toBe('user-data');
        expect(documents.kind()).toBe('collection');
        expect(firstDocument.id()).toBe(TEST_USER_DATA_DOCUMENT.id);
        expect(firstDocument.text()).toBe(TEST_USER_DATA_DOCUMENT.title);
        expect(note1.attached()).toBe(true);
        expect(note1.text()).toBe('note1');
      });
    }
  );
});
