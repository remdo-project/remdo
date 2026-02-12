import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { $getNodeByKey, $getSelection, $isRangeSelection, REDO_COMMAND, UNDO_COMMAND } from 'lexical';

import type { RemdoTestApi } from '@/editor/plugins/dev';
import {
  findNearestListItem,
  getNoteKey,
  placeCaretAtNote,
  pressKey,
  readCaretNoteId,
  readCaretNoteKey,
  readOutline,
  selectNoteRange,
  typeText,
  meta,
} from '#tests';

// Coverage gaps (handled in e2e instead of unit tests):
// - Inline Backspace/Delete inside a note: jsdom doesn’t emulate native deletion
//   events reliably, so these cases live in Playwright e2e.

describe('deletion semantics (docs/outliner/deletion.md)', () => {
  describe('caret mode', () => {
    it('treats Backspace at the start of the first note as a no-op', meta({ fixture: 'flat' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note1', 0);
      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('backspace at start of first note with children is a no-op', meta({ fixture: 'basic' }), async ({ remdo }) => {
            // Not a duplicate of the flat-case root no-op: this fixture has a child,
      // so Backspace must preserve the subtree instead of hoisting it.

      await placeCaretAtNote(remdo, 'note1', 0);
      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('backspace at start of a middle note with children merges and reparents', meta({ fixture: 'tree' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note2', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1 note2', children: [ { noteId: 'note3', text: 'note3' } ] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('merges a leaf into its previous sibling when Backspace is pressed at column 0', meta({ fixture: 'basic' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note3', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'note2 note3' },
          ],
        },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    });

    it('merges a first-child leaf into its parent body when siblings exist', meta({ fixture: 'basic' }), async ({ remdo }) => {
            // Make the parent have multiple children while keeping note2 the first child.
      await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });
      await typeText(remdo, 'note2.1');
      const note21Id = readCaretNoteId(remdo);
      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'note2' },
            { noteId: note21Id, text: 'note2.1' },
          ],
        },
        { noteId: 'note3', text: 'note3' },
      ]);

      await placeCaretAtNote(remdo, 'note2', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1 note2',
          children: [
            { noteId: note21Id, text: 'note2.1' },
          ],
        },
        { noteId: 'note3', text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('drops an empty child leaf when Backspace is pressed at its start', meta({ fixture: 'basic' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });
      const emptyChildId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: emptyChildId },
            { noteId: 'note2', text: 'note2' },
          ],
        },
        { noteId: 'note3', text: 'note3' },
      ]);

      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1', children: [ { noteId: 'note2', text: 'note2' } ] },
        { noteId: 'note3', text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('drops an empty grandchild when Backspace is pressed at its start', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note4', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Tab' }); // indent note4 under note2
      await pressKey(remdo, { key: 'Tab' }); // indent note4 under note3

      await pressKey(remdo, { key: 'Enter' }); // create empty sibling under note3
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'note2', children: [ { noteId: 'note3', text: 'note3', children: [ { noteId: 'note4', text: 'note4' } ] } ] },
          ],
        },
        { noteId: 'note5', text: 'note5' },
        { noteId: 'note6', text: 'note6', children: [ { noteId: 'note7', text: 'note7' } ] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });
    });

    it('merges a leaf into its previous leaf sibling when Backspace is pressed at column 0', meta({ fixture: 'flat' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note2', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1 note2' },
        { noteId: 'note3', text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('merges with the previous note in document order (across subtrees) on Backspace at column 0', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note5', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'note2', children: [ { noteId: 'note3', text: 'note3' } ] },
            { noteId: 'note4', text: 'note4 note5' },
          ],
        },
        { noteId: 'note6', text: 'note6', children: [ { noteId: 'note7', text: 'note7' } ] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });
    });

    it('drops a previous empty leaf and keeps the caret on the current note when Backspace is pressed at column 0', meta({ fixture: 'flat' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' }); // create an empty leaf between note1 and note2

      await placeCaretAtNote(remdo, 'note2', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    });

    it('drops a previous empty leaf even when the current note has children', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
            const before = readOutline(remdo);

      await placeCaretAtNote(remdo, 'note5', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' }); // empty leaf between note5 and note6

      await placeCaretAtNote(remdo, 'note6', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note6' });
    });

    it('drops an empty leaf without touching surrounding text', meta({ fixture: 'flat' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      const before = remdo.getEditorState();
      await pressKey(remdo, { key: 'Enter' });

      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('drops an empty leaf when Delete is pressed at its end (instead of deleting the next note)', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
            expect(remdo).toMatchOutline([
        { noteId: 'alpha', text: 'alpha' },
        { noteId: 'space', text: ' ' },
        { noteId: 'beta', text: 'beta' },
        {
          noteId: 'parent',
          children: [
            { noteId: 'nestedEmpty' },
            { noteId: 'child', text: 'child-of-empty' },
            { noteId: 'nestedAfterChild' },
          ],
        },
        { noteId: 'trailing' },
      ]);

      await placeCaretAtNote(remdo, 'space', Number.POSITIVE_INFINITY);

      const emptyNoteKey = readCaretNoteKey(remdo);
      const betaKey = getNoteKey(remdo, 'beta');

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { noteId: 'alpha', text: 'alpha' },
        { noteId: 'beta', text: 'beta' },
        {
          noteId: 'parent',
          children: [
            { noteId: 'nestedEmpty' },
            { noteId: 'child', text: 'child-of-empty' },
            { noteId: 'nestedAfterChild' },
          ],
        },
        { noteId: 'trailing' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'beta' });

      // This assertion is the core regression check: the empty leaf should be removed,
      // leaving the following note intact.
      expect(isNodeAttached(remdo, emptyNoteKey)).toBe(false);
      expect(isNodeAttached(remdo, betaKey)).toBe(true);
    });

    it('drops the next empty leaf without merging when Delete is pressed at the end of a note', meta({ fixture: 'flat' }), async ({ remdo }) => {
            const before = readOutline(remdo);

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' }); // create an empty leaf after note1

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('drops an empty child when Delete is pressed at its end even when the next note is a cousin', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
            const before = readOutline(remdo);

      await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' }); // create empty sibling under note2
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });
    });

    it('drops an empty leaf when Delete is pressed at its end and it is the last note', meta({ fixture: 'flat' }), async ({ remdo }) => {
            const before = readOutline(remdo);

      await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' }); // create empty leaf after note3
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });
    });

    it('drops an empty leaf when Delete is pressed at its end and the next note has children', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
            const before = readOutline(remdo);

      await placeCaretAtNote(remdo, 'note5', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' }); // create empty leaf between note5 and note6
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note6' });
    });

    it('ignores Delete at a parent end when the next note in document order has children', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('drops an empty first child when Delete is pressed at the parent end', meta({ fixture: 'basic' }), async ({ remdo }) => {
            const before = readOutline(remdo);

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });
      const emptyChildId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: emptyChildId },
            { noteId: 'note2', text: 'note2' },
          ],
        },
        { noteId: 'note3', text: 'note3' },
      ]);

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('merges the next leaf into the current note with Delete at the end of the line', meta({ fixture: 'flat' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1 note2' },
        { noteId: 'note3', text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('merges with the next note in document order even when it is not a same-depth sibling', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'note2', children: [ { noteId: 'note3', text: 'note3 note4' } ] },
          ],
        },
        { noteId: 'note5', text: 'note5' },
        { noteId: 'note6', text: 'note6', children: [ { noteId: 'note7', text: 'note7' } ] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });
    });

    it('merges the next note and reparents its children when Delete is pressed before a parent', meta({ fixture: 'tree' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1 note2', children: [ { noteId: 'note3', text: 'note3' } ] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('treats Delete at the end of the last note as a no-op', meta({ fixture: 'flat' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });
    });

    it('keeps a single empty note when Delete is pressed at its end', meta({ fixture: 'flat' }), async ({ remdo }) => {
            await selectNoteRange(remdo, 'note1', 'note3');
      await pressKey(remdo, { key: 'Delete' });

      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchEditorState(before);

      const caretStatus = readCollapsedCaretStatus(remdo);
      expect(caretStatus.isRangeSelection).toBe(true);
      expect(caretStatus.isCollapsed).toBe(true);
      expect(caretStatus.hasListItem).toBe(true);
    });

    it('merges the first child leaf into the parent when Delete is pressed at the parent end', meta({ fixture: 'basic' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1 note2' },
        { noteId: 'note3', text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('avoids adding extra space on Backspace when the right fragment already starts with whitespace', meta({ fixture: 'edge-spaces' }), async ({ remdo }) => {
            expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2SpaceLeft', text: ' note2SpaceLeft' },
        { noteId: 'note3', text: 'note3' },
        { noteId: 'note4SpaceRight', text: 'note4SpaceRight ' },
        { noteId: 'note5', text: 'note5' },
      ]);
      await placeCaretAtNote(remdo, 'note2SpaceLeft', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1 note2SpaceLeft' },
        { noteId: 'note3', text: 'note3' },
        { noteId: 'note4SpaceRight', text: 'note4SpaceRight ' },
        { noteId: 'note5', text: 'note5' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('avoids adding extra space on Backspace when the left fragment already ends with whitespace', meta({ fixture: 'edge-spaces' }), async ({ remdo }) => {
            expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2SpaceLeft', text: ' note2SpaceLeft' },
        { noteId: 'note3', text: 'note3' },
        { noteId: 'note4SpaceRight', text: 'note4SpaceRight ' },
        { noteId: 'note5', text: 'note5' },
      ]);
      await placeCaretAtNote(remdo, 'note5', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2SpaceLeft', text: ' note2SpaceLeft' },
        { noteId: 'note3', text: 'note3' },
        { noteId: 'note4SpaceRight', text: 'note4SpaceRight note5' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note4SpaceRight' });
    });

    it('avoids adding extra space when the right fragment already starts with whitespace', meta({ fixture: 'edge-spaces' }), async ({ remdo }) => {
            expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2SpaceLeft', text: ' note2SpaceLeft' },
        { noteId: 'note3', text: 'note3' },
        { noteId: 'note4SpaceRight', text: 'note4SpaceRight ' },
        { noteId: 'note5', text: 'note5' },
      ]);
      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1 note2SpaceLeft' },
        { noteId: 'note3', text: 'note3' },
        { noteId: 'note4SpaceRight', text: 'note4SpaceRight ' },
        { noteId: 'note5', text: 'note5' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('avoids adding extra space when the left fragment already ends with whitespace', meta({ fixture: 'edge-spaces' }), async ({ remdo }) => {
            expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2SpaceLeft', text: ' note2SpaceLeft' },
        { noteId: 'note3', text: 'note3' },
        { noteId: 'note4SpaceRight', text: 'note4SpaceRight ' },
        { noteId: 'note5', text: 'note5' },
      ]);
      await placeCaretAtNote(remdo, 'note4SpaceRight', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2SpaceLeft', text: ' note2SpaceLeft' },
        { noteId: 'note3', text: 'note3' },
        { noteId: 'note4SpaceRight', text: 'note4SpaceRight note5' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note4SpaceRight' });
    });
  });

  describe('structural selection', () => {
    it('removes the selected notes and focuses the next sibling at the same depth', meta({ fixture: 'flat' }), async ({ remdo }) => {
            await selectNoteRange(remdo, 'note1', 'note2');

      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([{ noteId: 'note3', text: 'note3' }]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });
    });

    it('deletes only the selected empty note after Cmd/Ctrl+A', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'trailing');

      await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

      await waitFor(() => {
        expect(remdo.editor.selection.isStructural()).toBe(true);
      });

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { noteId: 'alpha', text: 'alpha' },
        { noteId: 'space', text: ' ' },
        { noteId: 'beta', text: 'beta' },
        {
          noteId: 'parent',
          children: [
            { noteId: 'nestedEmpty' },
            { noteId: 'child', text: 'child-of-empty' },
            { noteId: 'nestedAfterChild' },
          ],
        },
      ]);
    });

    it('focuses the previous sibling when no next sibling survives the structural delete', meta({ fixture: 'flat' }), async ({ remdo }) => {
            await selectNoteRange(remdo, 'note2', 'note3');

      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([{ noteId: 'note1', text: 'note1' }]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('keeps the document non-empty when structural deletion removes every note', meta({ fixture: 'flat' }), async ({ remdo }) => {
            await selectNoteRange(remdo, 'note1', 'note3');
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([{ noteId: null }]);

      const caretStatus = readCollapsedCaretStatus(remdo);
      expect(caretStatus.isRangeSelection).toBe(true);
      expect(caretStatus.isCollapsed).toBe(true);
      expect(caretStatus.hasListItem).toBe(true);
    });

    it('lands the caret on the parent body when deleting the only child in a subtree', meta({ fixture: 'basic' }), async ({ remdo }) => {
            await placeCaretAtNote(remdo, 'note2');
      await pressKey(remdo, { key: 'ArrowDown', shift: true }); // inline stage
      await pressKey(remdo, { key: 'ArrowDown', shift: true }); // structural stage

      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note3', text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('restores text and structure via undo/redo after structural deletion', meta({ fixture: 'flat' }), async ({ remdo }) => {
            await remdo.waitForSynced();

      const original = remdo.getEditorState();

      await selectNoteRange(remdo, 'note1', 'note2');
      await pressKey(remdo, { key: 'Delete' });

      await remdo.waitForSynced();
      const afterDelete = remdo.getEditorState();

      await remdo.dispatchCommand(UNDO_COMMAND);
      await remdo.waitForSynced();
      expect(remdo).toMatchEditorState(original);

      await remdo.dispatchCommand(REDO_COMMAND);
      await remdo.waitForSynced();
      expect(remdo).toMatchEditorState(afterDelete);
    });
  });
});

function isNodeAttached(remdo: RemdoTestApi, key: string): boolean {
  return remdo.validate(() => {
    const node = $getNodeByKey(key);
    return !!node && node.isAttached();
  });
}

function readCollapsedCaretStatus(remdo: RemdoTestApi): { isRangeSelection: boolean; isCollapsed: boolean; hasListItem: boolean } {
  return remdo.validate(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return { isRangeSelection: false, isCollapsed: false, hasListItem: false };
    }

    const item = findNearestListItem(selection.anchor.getNode()) ?? findNearestListItem(selection.focus.getNode());
    return { isRangeSelection: true, isCollapsed: selection.isCollapsed(), hasListItem: Boolean(item) };
  });
}
