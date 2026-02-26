import { describe, expect, it } from 'vitest';
import { meta, placeCaretAtNote } from '#tests';
import { createLexicalNoteSdk } from '@/editor/outline/sdk/adapters/lexical';

describe('sdk showcase', () => {
  it(
    'starts from flat fixture and performs a full sdk workflow (select, create, place, indent/outdent, delete)',
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

      let mutationResult:
          | {
            placedIdLength: number;
            placedText: string;
            placedAttached: boolean;
            indentResult: boolean;
            outdentResult: boolean;
            deleteResult: boolean;
          }
        | null = null;

      await remdo.mutate(() => {
        const sdkNote = sdk.createNote({ after: 'note2' }, 'sdk note');

        const indentResult = sdk.indent({ start: sdkNote.id(), end: sdkNote.id() });
        const outdentResult = sdk.outdent({ start: sdkNote.id(), end: sdkNote.id() });
        sdk.place({ start: 'note2', end: 'note2' }, { before: 'note1' });
        const deleteResult = sdk.delete({ start: 'note3', end: 'note3' });

        mutationResult = {
          placedIdLength: sdkNote.id().length,
          placedText: sdkNote.text(),
          placedAttached: sdkNote.attached(),
          indentResult,
          outdentResult,
          deleteResult,
        };
      });

      expect(mutationResult).not.toBeNull();
      expect(mutationResult!.placedIdLength).toBeGreaterThan(0);
      expect(mutationResult!.placedText).toBe('sdk note');
      expect(mutationResult!.placedAttached).toBe(true);
      expect(mutationResult!.indentResult).toBe(true);
      expect(mutationResult!.outdentResult).toBe(true);
      expect(mutationResult!.deleteResult).toBe(true);

      expect(remdo).toMatchOutline([
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note1', text: 'note1' },
        { noteId: null, text: 'sdk note' },
      ]);
    }
  );
});
