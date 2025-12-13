import { describe, expect, it } from 'vitest';
import { $getRoot, $isTextNode, REDO_COMMAND, UNDO_COMMAND } from 'lexical';
import type { TextNode } from 'lexical';
import { $isListNode } from '@lexical/list';

import type { RemdoTestApi } from '@/editor/plugins/dev';
import { placeCaretAtNote, pressKey, selectNoteRange, typeText } from '#tests';

// Coverage gaps (handled in e2e instead of unit tests):
// - Forward `Delete` at the caret: jsdom doesn’t emulate the browser’s native
//   `beforeinput`/`input` sequence for `Delete`, so unit tests can’t reliably
//   validate real user behavior. These cases live in Playwright e2e where the
//   browser event model is accurate.

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

    it('drops an empty leaf without touching surrounding text', async ({ remdo }) => {
      await remdo.load('flat');

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      const before = remdo.getEditorState();
      await pressKey(remdo, { key: 'Enter' });

      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchEditorState(before);
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

    it('ignores Delete at note end when the current note has children', async ({ remdo }) => {
      //TODO review this case and all below
      await remdo.load('basic');

      await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
      const before = remdo.getEditorState();

      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchEditorState(before);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    it.fails('treats Backspace in the middle of a note like plain text', async ({ remdo }) => {
      await remdo.load('flat');

      await placeCaretAtNote(remdo, 'note1', 1);
      await pressKey(remdo, { key: 'Backspace' });

      expect(remdo).toMatchOutline([
        { text: 'ote1' },
        { text: 'note2' },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'ote1' });
    });

    it('avoids adding extra space when the right fragment already starts with whitespace', async ({ remdo }) => {
      await remdo.load('flat');

      await setNoteText(remdo, 'note1', 'left');
      await setNoteText(remdo, 'note2', ' right');

      await placeCaretAtNote(remdo, 'left', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { text: 'left right' },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'left right' });
    });

    it('avoids adding extra space when the left fragment already ends with whitespace', async ({ remdo }) => {
      await remdo.load('flat');

      await setNoteText(remdo, 'note1', 'left ');
      await setNoteText(remdo, 'note2', 'right');

      await placeCaretAtNote(remdo, 'left', Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Delete' });

      expect(remdo).toMatchOutline([
        { text: 'left right' },
        { text: 'note3' },
      ]);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'left right' });
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

    it.fails('lands the caret on the parent body when deleting the only child in a subtree', async ({ remdo }) => {
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

    it.skip('restores text and structure via undo/redo after structural deletion', async ({ remdo }) => {
      // Flaky under single-file runs: undo sometimes replays an extra wrapper list (value reset) even though
      // the full suite keeps history stable. Skip until undo/redo determinism is fixed in the deletion flow.
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

async function setNoteText(remdo: RemdoTestApi, label: string, nextText: string) {
  await remdo.mutate(() => {
    const root = $getRoot();
    const list = root.getFirstChild();
    if (!list || !$isListNode(list)) {
      throw new Error('Expected root list');
    }

    const target = findItemByText(list, label);
    if (!target) {
      throw new Error(`No note found with text: ${label}`);
    }

    const textNode = target
      .getChildren()
      .find((child: unknown): child is TextNode => {
        if (!child || typeof (child as { getType?: () => string }).getType !== 'function') {
          return false;
        }
        return (child as { getType: () => string }).getType() !== 'list';
      });

    if (!textNode || !$isTextNode(textNode)) {
      throw new Error('Expected a text node to update');
    }

    textNode.setTextContent(nextText);
  });
}

function findItemByText(list: any, targetText: string): any {
  const items = list?.getChildren?.() ?? [];
  for (const item of items) {
    const children = item?.getChildren?.() ?? [];
    const contentNodes = children.filter((child: any) => child?.getType?.() !== 'list');
    const label = contentNodes
      .map((child: any) => child?.getTextContent?.() ?? '')
      .join('')
      .trim();

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
