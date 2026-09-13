/**
 * Illustrative examples of the current experimental note SDK surface.
 *
 * These examples optimize for showing consumer usage, not for defining an
 * accepted API or exhaustively covering behavior. Required host setup remains
 * visible when it is part of the current surface, so awkwardness is not hidden.
 * Focused unit and integration specs remain the quality gate.
 */
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  getTestUserData,
  meta,
  resetTestUserData,
  TEST_USER_DATA_DOCUMENT,
} from '#tests';
import { createUserDataRootNote } from '#note-sdk';

describe('note SDK showcase', () => {
  describe('open document session', () => {
    it("reads an addressed note's text", meta({ fixture: 'tree' }), ({ remdo }) => {
      const note = remdo.documentSession.note('note2');

      expect(note.text()).toBe('note2');
    });

    it("reads and toggles an addressed note's folded state", meta({ fixture: 'tree' }), async ({ remdo }) => {
      const note = remdo.documentSession.note('note2');

      expect(note.folded()).toBe(false);

      await note.toggleFold();

      expect(note.folded()).toBe(true);
    });

    it("observes an addressed note's text after an editor-originated change", meta({ fixture: 'tree' }), async ({ remdo }) => {
      const note = remdo.documentSession.note('note2');
      let text = note.text();
      const unsubscribe = note.subscribe(() => {
        text = note.text();
      });
      onTestFinished(unsubscribe);

      await remdo.updateNoteText('note2', 'changed');

      await vi.waitFor(() => {
        expect(text).toBe('changed');
      });
    });
  });

  describe('user data', () => {
    beforeEach(() => {
      resetTestUserData();
    });

    it('lists and creates documents through a projected user-data collection', async () => {
      const userData = getTestUserData();
      const documents = userData.documents();

      expect(documents.id()).toBe('user-documents');
      expect(documents.kind()).toBe('collection');
      expect(documents.byId(TEST_USER_DATA_DOCUMENT.id)?.text()).toBe(TEST_USER_DATA_DOCUMENT.title);
      expect(documents.children().map((document) => ({
        id: document.id(),
        text: document.text(),
      }))).toEqual([
        { id: TEST_USER_DATA_DOCUMENT.id, text: TEST_USER_DATA_DOCUMENT.title },
      ]);

      const createdDocument = await documents.create('New Document');

      expect(createdDocument.kind()).toBe('document');
      expect(documents.children().map((document) => ({
        id: document.id(),
        text: document.text(),
      }))).toEqual([
        { id: TEST_USER_DATA_DOCUMENT.id, text: TEST_USER_DATA_DOCUMENT.title },
        { id: createdDocument.id(), text: 'New Document' },
      ]);
    });

    it('manages sharing through document-level user-data handles', async () => {
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
        shareDocument: async (documentId, email) => ({
          documentId,
          email,
          granteeUserId: 'bob',
          name: 'Bob',
        }),
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

      expect(shared.kind()).toBe('document-access');
      expect(shared.text()).toBe('Bob');
    });

    it('reads source servers through the same projected collection shape', () => {
      const userData = createUserDataRootNote([], [{
        id: 'source',
        label: 'Source Server',
        baseUrl: 'https://source.example',
      }], {});

      const sourceServers = userData.sourceServers();

      expect(sourceServers.id()).toBe('source-servers');
      expect(sourceServers.kind()).toBe('collection');
      expect(sourceServers.children().map((server) => ({
        id: server.id(),
        text: server.text(),
        baseUrl: server.baseUrl(),
      }))).toEqual([{
        id: 'source',
        text: 'Source Server',
        baseUrl: 'https://source.example',
      }]);
    });

    it('reads grouped document sources as collection notes', () => {
      const localDocuments = [{ id: 'localDoc', title: 'Local Document' }];
      const remoteDocuments = [{ id: 'sourceDoc', title: 'Source Document' }];
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

    it('shows explicit user-data note narrowing with as(kind)', () => {
      const userData = createUserDataRootNote([TEST_USER_DATA_DOCUMENT]);
      const documents = userData.documents();
      const firstDocument = documents.children()[0]!;

      expect(userData.as('user-data')).toBe(userData);
      expect(documents.as('collection')).toBe(documents);
      expect(firstDocument.as('document')).toBe(firstDocument);
      expect(firstDocument.text()).toBe(TEST_USER_DATA_DOCUMENT.title);
    });
  });
});
