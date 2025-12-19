import { describe, expect, it } from 'vitest';
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { $isListNode } from '@lexical/list';
import { config } from '#config';

import type { RemdoTestApi } from '@/editor/plugins/dev';
import { findNearestListItem, placeCaretAtNote, pressKey, selectNoteRange, typeText } from '#tests';

// Coverage gaps (handled in e2e instead of unit tests):
// - Inline Backspace/Delete inside a note: jsdom doesn’t emulate native deletion
//   events reliably, so these cases live in Playwright e2e.

describe('deletion semantics (docs/outliner/deletion.md)', () => {
  describe('caret mode', () => {
    it('treats Backspace at the start of the first note as a no-op', async ({ remdo }) => {
      await remdo.load('flat');

      await placeCaretAtNote(remdo, 'note1', 0);
      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('backspace at start of first note with children is a no-op', async ({ remdo }) => {
      await remdo.load('basic');
      // Not a duplicate of the flat-case root no-op: this fixture has a child,
      // so Backspace must preserve the subtree instead of hoisting it.

      await placeCaretAtNote(remdo, 'note1', 0);
      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('backspace at start of a middle note with children is a no-op', async ({ remdo }) => {
      await remdo.load('tree');

      await placeCaretAtNote(remdo, 'note2', 0);
      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    });

    it('merges a leaf into its previous sibling when Backspace is pressed at column 0', async ({ remdo }) => {
      await remdo.load('basic');

      await placeCaretAtNote(remdo, 'note3', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            { text: 'note2 note3' },
          ],
        },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2 note3' });
    });

    it('merges a first-child leaf into its parent body when siblings exist', async ({ remdo }) => {
      await remdo.load('basic');

      // Make the parent have multiple children while keeping note2 the first child.
      await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });
      await typeText(remdo, 'note2.1');
      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            { text: 'note2' },
            { text: 'note2.1' },
          ],
        },
        { text: 'note3' },
      ]);

      await placeCaretAtNote(remdo, 'note2', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        {
          text: 'note1 note2',
          children: [
            { text: 'note2.1' },
          ],
        },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1 note2' });
    });

    it('drops an empty child leaf when Backspace is pressed at its start', async ({ remdo }) => {
      await remdo.load('basic');

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });

      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            {},
            { text: 'note2' },
          ],
        },
        { text: 'note3' },
      ]);

      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        { text: 'note1', children: [ { text: 'note2' } ] },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('drops an empty grandchild when Backspace is pressed at its start', async ({ remdo }) => {
      await remdo.load('tree_complex');

      await placeCaretAtNote(remdo, 'note4', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Tab' }); // indent note4 under note2
      await pressKey(remdo, { key: 'Tab' }); // indent note4 under note3

      await pressKey(remdo, { key: 'Enter' }); // create empty sibling under note3
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            { text: 'note2', children: [ { text: 'note3', children: [ { text: 'note4' } ] } ] },
          ],
        },
        { text: 'note5' },
        { text: 'note6', children: [ { text: 'note7' } ] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });
    });

    it('merges a leaf into its previous leaf sibling when Backspace is pressed at column 0', async ({ remdo }) => {
      await remdo.load('flat');

      await placeCaretAtNote(remdo, 'note2', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        { text: 'note1 note2' },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1 note2' });
    });

    it('merges with the previous note in document order (across subtrees) on Backspace at column 0', async ({ remdo }) => {
      await remdo.load('tree_complex');

      await placeCaretAtNote(remdo, 'note5', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            { text: 'note2', children: [ { text: 'note3' } ] },
            { text: 'note4 note5' },
          ],
        },
        { text: 'note6', children: [ { text: 'note7' } ] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note4 note5' });
    });

    it('drops a previous empty leaf and keeps the caret on the current note when Backspace is pressed at column 0', async ({ remdo }) => {
      await remdo.load('flat');

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' }); // create an empty leaf between note1 and note2

      await placeCaretAtNote(remdo, 'note2', 0);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        { text: 'note1' },
        { text: 'note2' },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    });

    it('drops an empty leaf without touching surrounding text', async ({ remdo }) => {
      await remdo.load('flat');

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      const before = remdo.getEditorState();
      await pressKey(remdo, { key: 'Enter' });

      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('drops an empty leaf when Delete is pressed at its end (instead of deleting the next note)', async ({ remdo }) => {
      await remdo.load('empty-labels');

      expect(remdo).toMatchOutline([
        { text: 'alpha' },
        { text: ' ' },
        { text: 'beta' },
        {
          children: [
            {},
            { text: 'child-of-empty' },
          ],
        },
      ]);

      await placeCaretAtNote(remdo, ' ', Number.POSITIVE_INFINITY);

      const emptyNoteKey = readCaretNoteKey(remdo);
      const betaKey = readNoteKeyByText(remdo, 'beta');

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { text: 'alpha' },
        { text: 'beta' },
        {
          children: [
            {},
            { text: 'child-of-empty' },
          ],
        },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'beta' });

      // This assertion is the core regression check: the empty leaf should be removed,
      // leaving the following note intact.
      expect(isNodeAttached(remdo, emptyNoteKey)).toBe(false);
      expect(isNodeAttached(remdo, betaKey)).toBe(true);
    });

    it('drops the next empty leaf without merging when Delete is pressed at the end of a note', async ({ remdo }) => {
      await remdo.load('flat');

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' }); // create an empty leaf after note1

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { text: 'note1' },
        { text: 'note2' },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('drops an empty child when Delete is pressed at its end even when the next note is a cousin', async ({ remdo }) => {
      await remdo.load('tree_complex');

      await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' }); // create empty sibling under note2
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            { text: 'note2', children: [ { text: 'note3' } ] },
            { text: 'note4' },
          ],
        },
        { text: 'note5' },
        { text: 'note6', children: [ { text: 'note7' } ] },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });
    });

    it('ignores Delete at a parent end when the next note in document order has children', async ({ remdo }) => {
      await remdo.load('tree_complex');

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('drops an empty first child when Delete is pressed at the parent end', async ({ remdo }) => {
      await remdo.load('basic');

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });

      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            {},
            { text: 'note2' },
          ],
        },
        { text: 'note3' },
      ]);

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { text: 'note1', children: [ { text: 'note2' } ] },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('merges the next leaf into the current note with Delete at the end of the line', async ({ remdo }) => {
      await remdo.load('flat');

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { text: 'note1 note2' },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1 note2' });
    });

    it('ignores Delete at note end when the next sibling has children', async ({ remdo }) => {
      await remdo.load('tree');

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('treats Delete at the end of the last note as a no-op', async ({ remdo }) => {
      await remdo.load('flat');

      await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });
    });

    it('keeps a single empty note when Delete is pressed at its end', async ({ remdo }) => {
      await remdo.load('flat');

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

    it('merges the first child leaf into the parent when Delete is pressed at the parent end', async ({ remdo }) => {
      await remdo.load('basic');

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { text: 'note1 note2' },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1 note2' });
    });

    it('avoids adding extra space when the right fragment already starts with whitespace', async ({ remdo }) => {
      await remdo.load('edge-spaces');

      expect(remdo).toMatchOutline([
        { text: 'note1' },
        { text: ' note2-space-left' },
        { text: 'note3' },
        { text: 'note4-space-right ' },
        { text: 'note5' },
      ]);
      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { text: 'note1 note2-space-left' },
        { text: 'note3' },
        { text: 'note4-space-right ' },
        { text: 'note5' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1 note2-space-left' });
    });

    it('avoids adding extra space when the left fragment already ends with whitespace', async ({ remdo }) => {
      await remdo.load('edge-spaces');

      expect(remdo).toMatchOutline([
        { text: 'note1' },
        { text: ' note2-space-left' },
        { text: 'note3' },
        { text: 'note4-space-right ' },
        { text: 'note5' },
      ]);
      await placeCaretAtNote(remdo, 'note4-space-right ', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { text: 'note1' },
        { text: ' note2-space-left' },
        { text: 'note3' },
        { text: 'note4-space-right note5' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note4-space-right note5' });
    });
  });

  describe('structural selection', () => {
    it('removes the selected notes and focuses the next sibling at the same depth', async ({ remdo }) => {
      await remdo.load('flat');

      await selectNoteRange(remdo, 'note1', 'note2');

      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([{ text: 'note3' }]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });
    });

    it('focuses the previous sibling when no next sibling survives the structural delete', async ({ remdo }) => {
      await remdo.load('flat');

      await selectNoteRange(remdo, 'note2', 'note3');

      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([{ text: 'note1' }]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it('keeps the document non-empty when structural deletion removes every note', async ({ remdo }) => {
      await remdo.load('flat');

      await selectNoteRange(remdo, 'note1', 'note3');
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([{}]);

      const caretStatus = readCollapsedCaretStatus(remdo);
      expect(caretStatus.isRangeSelection).toBe(true);
      expect(caretStatus.isCollapsed).toBe(true);
      expect(caretStatus.hasListItem).toBe(true);
    });

    it('lands the caret on the parent body when deleting the only child in a subtree', async ({ remdo }) => {
      await remdo.load('basic');

      await placeCaretAtNote(remdo, 'note2');
      await pressKey(remdo, { key: 'ArrowDown', shift: true }); // inline stage
      await pressKey(remdo, { key: 'ArrowDown', shift: true }); // structural stage

      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { text: 'note1' },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it.skipIf(config.env.COLLAB_ENABLED)('restores text and structure via undo/redo after structural deletion', async ({ remdo }) => {
      await remdo.load('flat');
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

function findItemByText(list: any, targetText: string): any {
  const items = list?.getChildren?.() ?? [];
  for (const item of items) {
    const children = item?.getChildren?.() ?? [];
    const contentNodes = children.filter((child: any) => child?.getType?.() !== 'list');
    const label = contentNodes
      .map((child: any) => child?.getTextContent?.() ?? '')
      .join('');

    if (label === targetText) {
      return item;
    }

    const nestedLists = children.filter((child: any) => child?.getType?.() === 'list');
    for (const nested of nestedLists) {
      const found = findItemByText(nested, targetText);
      if (found) return found;
    }
  }

  return null;
}

function readNoteKeyByText(remdo: RemdoTestApi, label: string): string {
  return remdo.validate(() => {
    const root = $getRoot();
    const list = root.getFirstChild();
    if (!list || !$isListNode(list)) {
      throw new Error('Expected root list');
    }

    const item = findItemByText(list, label);
    if (!item) {
      throw new Error(`No note found with text: ${label}`);
    }

    return item.getKey();
  });
}

function readCaretNoteKey(remdo: RemdoTestApi): string {
  return remdo.validate(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      throw new Error('Expected collapsed caret selection');
    }

    const item = findNearestListItem(selection.anchor.getNode()) ?? findNearestListItem(selection.focus.getNode());
    if (!item) {
      throw new Error('Expected caret to be inside a list item');
    }

    return item.getKey();
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
