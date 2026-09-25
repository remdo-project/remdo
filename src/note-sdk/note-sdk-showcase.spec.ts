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
  createObservableDocumentList,
  getTestUserData,
  meta,
  placeCaretAtNote,
  resetTestUserData,
  selectNoteRange,
  TEST_USER_DATA_DOCUMENT,
} from '#tests';
import { createUserDataRootNote, IneligibleOperationError, NoteUnavailableError } from '#note-sdk';

describe('note SDK showcase', () => {
  describe('open document', () => {
    it('reads action eligibility directly and observes changes when needed', meta({ fixture: 'tree' }), async ({ remdo }) => {
      const openDocument = remdo.openDocument;
      await placeCaretAtNote(remdo, 'note1');
      expect(openDocument.focus.canToggleFold()).toBe(false);

      let canFold = openDocument.focus.canToggleFold();
      const unsubscribe = openDocument.subscribeCapabilities(() => {
        canFold = openDocument.focus.canToggleFold();
      });
      onTestFinished(unsubscribe);
      await placeCaretAtNote(remdo, 'note2');
      await vi.waitFor(() => expect(canFold).toBe(true));
      unsubscribe();

      await placeCaretAtNote(remdo, 'note1');
      expect(openDocument.focus.canToggleFold()).toBe(false);
    });

    it('retains a reference and reads fresh text after an edit', meta({ fixture: 'tree' }), async ({ remdo }) => {
      const note = remdo.openDocument.noteRef('note2');
      const earlierText = note.getText();

      await remdo.updateNoteText('note2', 'changed');

      expect(note.getText()).toBe('changed');
      expect(earlierText).toBe('note2');
    });

    it("reads and toggles an addressed note's folded state", meta({ fixture: 'tree' }), async ({ remdo }) => {
      const note = remdo.openDocument.noteRef('note2');

      expect(note.getFolded()).toBe(false);

      await note.toggleFold();

      expect(note.getFolded()).toBe(true);
    });

    it('discovers operations for a particular note, independent of focus', meta({ fixture: 'tree' }), ({ remdo }) => {
      const parent = remdo.openDocument.noteRef('note2');
      const leaf = remdo.openDocument.noteRef('note1');

      expect(parent.canToggleFold()).toBe(true);
      expect(parent.canSetChildListType()).toBe(true);
      expect(leaf.canToggleFold()).toBe(false);
      expect(leaf.canSetChildListType()).toBe(false);
    });

    it('toggles an addressed subtree', meta({ fixture: 'tree' }), async ({ remdo }) => {
      const note = remdo.openDocument.noteRef('note2');

      await note.toggleChecked();

      expect(note.getChecked()).toBe(true);
      expect(remdo.openDocument.noteRef('note3').getChecked()).toBe(true);
    });

    it('uses a note target to choose the contextual selected range', meta({ fixture: 'flat' }), async ({ remdo }) => {
      await selectNoteRange(remdo, 'note1', 'note2');

      remdo.openDocument.selection.toggleChecked({ noteId: 'note2' });

      await vi.waitFor(() => {
        expect(remdo.openDocument.noteRef('note1').getChecked()).toBe(true);
        expect(remdo.openDocument.noteRef('note2').getChecked()).toBe(true);
        expect(remdo.openDocument.noteRef('note3').getChecked()).toBe(false);
      });
    });

    it('changes the list owned by an addressed parent', meta({ fixture: 'tree-list-types' }), async ({ remdo }) => {
      const parent = remdo.openDocument.noteRef('note1');
      expect(parent.getChildListType()).toBe('number');

      await parent.setChildListType('check');

      expect(parent.getChildListType()).toBe('check');
    });

    it('appends an outline and addresses its new notes', meta({ fixture: 'flat' }), async ({ remdo }) => {
      const openDocument = remdo.openDocument;

      const [summaryId] = await openDocument.root.appendChildren([{
        text: 'Conversation summary',
        childListType: 'check',
        children: [{ text: 'Follow up' }],
      }]);
      const summary = openDocument.noteRef(summaryId!);
      expect(summary.getChildListType()).toBe('check');
      expect(summary.getChildren().map((note) => note.getText())).toEqual(['Follow up']);
      expect(openDocument.root.getChildren().at(-1)!.getText()).toBe('Conversation summary');

      await expect(openDocument.noteRef('missing').appendChildren([{ text: 'Lost' }]))
        .rejects.toThrow(IneligibleOperationError);
    });

    it("observes text changes and handles an unavailable note", meta({ fixture: 'tree' }), async ({ remdo }) => {
      const note = remdo.openDocument.noteRef('note2');
      let text: string | null = note.getText();
      const unsubscribe = note.subscribe(() => {
        try {
          text = note.getText();
        } catch (error) {
          if (!(error instanceof NoteUnavailableError)) throw error;
          text = null;
        }
      });
      onTestFinished(unsubscribe);

      await remdo.updateNoteText('note2', 'changed');

      await vi.waitFor(() => {
        expect(text).toBe('changed');
      });

      await placeCaretAtNote(remdo, 'note2');
      remdo.openDocument.selection.delete();
      await vi.waitFor(() => expect(text).toBeNull());
      unsubscribe();
    });
  });

  describe('user data', () => {
    beforeEach(() => {
      resetTestUserData();
    });

    it('lists and creates documents through a projected user-data collection', async () => {
      const userData = getTestUserData();
      const documents = userData.getDocuments();

      expect(documents.getId()).toBe('user-documents');
      expect(documents.getKind()).toBe('collection');
      expect(documents.getById(TEST_USER_DATA_DOCUMENT.id)?.getText()).toBe(TEST_USER_DATA_DOCUMENT.title);
      expect(documents.getChildren().map((document) => ({
        id: document.getId(),
        text: document.getText(),
      }))).toEqual([
        { id: TEST_USER_DATA_DOCUMENT.id, text: TEST_USER_DATA_DOCUMENT.title },
      ]);

      const createdDocument = await documents.create('New Document');

      expect(createdDocument.getKind()).toBe('document');
      expect(documents.getChildren().map((document) => ({
        id: document.getId(),
        text: document.getText(),
      }))).toEqual([
        { id: TEST_USER_DATA_DOCUMENT.id, text: TEST_USER_DATA_DOCUMENT.title },
        { id: createdDocument.getId(), text: 'New Document' },
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

      const document = userData.getDocuments().getById('doc')!;
      const access = document.getAccess();

      expect(access.getKind()).toBe('collection');
      expect(access.getChildren().map((person) => ({
        id: person.getId(),
        text: person.getText(),
        email: person.getEmail(),
      }))).toEqual([{
        id: 'alice',
        text: 'Alice',
        email: 'alice@example.test',
      }]);

      const shared = await document.shareWith('bob@example.test');

      expect(shared.getKind()).toBe('document-access');
      expect(shared.getText()).toBe('Bob');
    });

    it('observes a retained document through its source', () => {
      const { source, replace: replaceListing } = createObservableDocumentList([
        { id: 'doc', title: 'Draft', shareable: true },
      ]);
      const userData = createUserDataRootNote(source);
      const document = userData.getDocuments().getById('doc')!;
      const titles: Array<string | null> = [];
      const unsubscribe = document.subscribe(() => {
        try {
          titles.push(document.getText());
        } catch (error) {
          if (!(error instanceof NoteUnavailableError)) throw error;
          titles.push(null);
        }
      });

      replaceListing([{ id: 'doc', title: 'Quarterly plan', shareable: true }]);
      expect(document.getText()).toBe('Quarterly plan');
      replaceListing([]);
      expect(document.canShareWith()).toBe(false);
      unsubscribe();
      replaceListing([{ id: 'doc', title: 'Restored', shareable: true }]);

      expect(titles).toEqual(['Quarterly plan', null]);
    });

    it('reads grouped document sources as collection notes', () => {
      const localDocuments = [{ id: 'localDoc', title: 'Local Document' }];
      const remoteDocuments = [{ id: 'sourceDoc', title: 'Source Document' }];
      const userData = createUserDataRootNote(localDocuments, {
        documentSources: {
          getById: (sourceId) => sourceId === 'source'
            ? {
                baseUrl: 'https://source.example',
                documents: {
                  getById: (documentId) => remoteDocuments.find((document) => document.id === documentId) ?? null,
                  getChildren: () => remoteDocuments,
                },
                id: 'source',
                label: 'Source Server',
                local: false,
              }
            : null,
          getChildren: () => [{
            baseUrl: null,
            documents: {
              getById: (documentId) => localDocuments.find((document) => document.id === documentId) ?? null,
              getChildren: () => localDocuments,
            },
            id: 'local',
            label: 'Current Server',
            local: true,
          }, {
            baseUrl: 'https://source.example',
            documents: {
              getById: (documentId) => remoteDocuments.find((document) => document.id === documentId) ?? null,
              getChildren: () => remoteDocuments,
            },
            id: 'source',
            label: 'Source Server',
            local: false,
          }],
        },
      });

      expect(userData.getDocumentSources().getChildren().map((source) => ({
        documents: source.getDocuments().getChildren().map((document) => document.getText()),
        id: source.getId(),
        text: source.getText(),
      }))).toEqual([
        { id: 'local', text: 'Current Server', documents: ['Local Document'] },
        { id: 'source', text: 'Source Server', documents: ['Source Document'] },
      ]);
    });

    it('shows explicit user-data note narrowing with as(kind)', () => {
      const userData = createUserDataRootNote([TEST_USER_DATA_DOCUMENT]);
      const documents = userData.getDocuments();
      const firstDocument = documents.getChildren()[0]!;

      expect(userData.as('user-data')).toBe(userData);
      expect(documents.as('collection')).toBe(documents);
      expect(firstDocument.as('document')).toBe(firstDocument);
      expect(firstDocument.getText()).toBe(TEST_USER_DATA_DOCUMENT.title);
    });
  });
});
