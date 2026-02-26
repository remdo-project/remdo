import { describe, expect, it } from 'vitest';
import { meta, placeCaretAtNote } from '#tests';
import { createLexicalNoteSdk } from '@/editor/outline/sdk/adapters/lexical';

describe('sdk showcase', () => {
  it(
    'walks through the main sdk workflow on a flat fixture (select, read, create, place, indent/outdent, move, delete)',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2');
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
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

      let sdkNoteId = '';
      await remdo.mutate(() => {
        const sdkNote = sdk.createNote({ after: 'note2' }, 'sdk note');
        sdkNoteId = sdkNote.id();
        sdk.place({ start: 'note2', end: 'note2' }, { before: 'note1' });
      });

      expect(remdo).toMatchOutline([
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note1', text: 'note1' },
        { noteId: null, text: 'sdk note' },
        { noteId: 'note3', text: 'note3' },
      ]);

      await remdo.mutate(() => {
        sdk.indent({ start: sdkNoteId, end: sdkNoteId });
        sdk.note('note1').children().map((child) => child.id());

        sdk.outdent({ start: sdkNoteId, end: sdkNoteId });
        sdk.note('note1').children().map((child) => child.id());

        sdk.moveDown({ start: 'note2', end: 'note2' });
        sdk.moveUp({ start: 'note2', end: 'note2' });
        sdk.delete({ start: 'note3', end: 'note3' });
      });

      expect(remdo).toMatchOutline([
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note1', text: 'note1' },
        { noteId: null, text: 'sdk note' },
      ]);
    }
  );
});
