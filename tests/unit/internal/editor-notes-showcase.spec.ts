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
import { beforeEach, describe, expect, it } from 'vitest';
import { getTestUserConfig, meta, placeCaretAtNote, resetTestUserConfig } from '#tests';
import { createLexicalEditorNotes } from '@/editor/notes';

describe('editor notes showcase', () => {
  beforeEach(() => {
    resetTestUserConfig();
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
      let childNoteId = '';
      await remdo.mutate(() => {
        const topNote = sdk.currentDocument().create({ after: 'note2' }, 'sdk note');
        topNoteId = topNote.id();
        const childNote = sdk.note('note1').create('child note');
        childNoteId = childNote.id();
        sdk.place({ start: 'note2', end: 'note2' }, { before: 'note1' });
      });

      expect(remdo).toMatchOutline([
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note1', text: 'note1', children: [{ noteId: null, text: 'child note' }] },
        { noteId: null, text: 'sdk note' },
        { noteId: 'note3', text: 'note3' },
      ]);

      remdo.validate(() => {
        expect(childNoteId.length).toBeGreaterThan(0);
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
    'lists and creates documents through user-config document-list traversal',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note1');
      const userConfig = await getTestUserConfig();
      const documentList = userConfig.documentList();

      remdo.validate(() => {
        expect(documentList.children().map((document) => ({
          id: document.id(),
          text: document.text(),
        }))).toEqual([
          { id: 'main', text: 'Main' },
        ]);
      });

      const createdDocument = await documentList.create('New Document');

      remdo.validate(() => {
        expect(createdDocument.kind()).toBe('document');
        expect(documentList.children().map((document) => ({
          id: document.id(),
          text: document.text(),
        }))).toEqual([
          { id: 'main', text: 'Main' },
          { id: createdDocument.id(), text: 'New Document' },
        ]);
      });
    }
  );

  it(
    'shows explicit note narrowing with as(kind)',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note1');
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const userConfig = await getTestUserConfig();

      remdo.validate(() => {
        const documentList = userConfig.documentList();
        const firstDocument = documentList.children()[0]!;
        const note1 = sdk.note('note1').as('editor-note');

        expect(userConfig.kind()).toBe('user-config');
        expect(documentList.kind()).toBe('document-list');
        expect(firstDocument.id()).toBe('main');
        expect(firstDocument.text()).toBe('Main');
        expect(note1.attached()).toBe(true);
        expect(note1.text()).toBe('note1');
      });
    }
  );
});
