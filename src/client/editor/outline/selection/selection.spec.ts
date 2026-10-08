import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Outline } from '#tests';
import {
  collectSelectedListItems,
  collapseDomSelectionAtNode,
  dragDomSelectionBetween,
  dragDomSelectionBetweenRange,
  extendDomSelectionToNode,
  $getNoteIdOrThrow,
  getNoteElement,
  getNoteTextNode,
  getRootElementOrThrow,
  placeCaretAtNote,
  selectNoteSubtree,
  getNoteKey,
  readCaretNoteKey,
  pressKey,
  stepSelectionLadder,
  readOutline,
  typeText,
  meta,
} from '#tests';
import { $createRangeSelection, $setSelection, $createTextNode, $getSelection, $isRangeSelection, SELECT_ALL_COMMAND } from 'lexical';
import type { RangeSelection } from 'lexical';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { $restoreInlineSelection } from '#client/editor/outline/selection/progressive';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND } from '#client/editor/foundation/commands';

const TREE_COMPLEX_OUTLINE: Outline = [
  {
    noteId: 'note1',
    text: 'note1',
    children: [
      { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
      { noteId: 'note4', text: 'note4' },
    ],
  },
  { noteId: 'note5', text: 'note5' },
  { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
];

describe('selection plugin', () => {
  it('snaps pointer drags across note boundaries to contiguous structural slices', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        const note2Text = getNoteTextNode(remdo, 'note2');
    const note5Text = getNoteTextNode(remdo, 'note5');
    await dragDomSelectionBetween(note2Text, 1, note5Text, 1);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5'],
      });
    });

    const note6Text = getNoteTextNode(remdo, 'note6');
    const note7Text = getNoteTextNode(remdo, 'note7');
    await dragDomSelectionBetween(note6Text, 0, note7Text, note7Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note6', 'note7'],
      });
    });
  });

  it('keeps a later caret instead of applying an earlier queued pointer snap', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await act(async () => {
      remdo.editor.update(() => {
        const selection = $createRangeSelection();
        const first = $findNoteById('note1')!.getAllTextNodes()[0]!;
        const second = $findNoteById('note2')!.getAllTextNodes()[0]!;
        selection.setTextNodeRange(first, 1, second, 1);
        $setSelection(selection);
      }, { discrete: true });
      remdo.editor.update(() => {
        $findNoteById('note3')!.getAllTextNodes()[0]!.select(2, 2);
      }, { discrete: true });
    });
    await remdo.waitForSynced();
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });
    expect(remdo.validate(() => ($getSelection() as RangeSelection).focus.offset)).toBe(2);
  });

  it('preserves selection direction for backward pointer drags', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        const note5Text = getNoteTextNode(remdo, 'note5');
    const note2Text = getNoteTextNode(remdo, 'note2');
    await dragDomSelectionBetween(note5Text, note5Text.length, note2Text, 0);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5'],
      });
    });

    const isBackward = remdo.validate(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      return (selection as ReturnType<typeof $getSelection> & { isBackward: () => boolean }).isBackward();
    });

    expect(isBackward).toBe(true);
  });

  it('snaps drags that cross from a parent into its child to the full subtree', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        const parentText = getNoteTextNode(remdo, 'note2');
    const childText = getNoteTextNode(remdo, 'note3');
    await dragDomSelectionBetween(parentText, parentText.length, childText, 1);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note2', 'note3'],
      });
    });
  });

  it('snaps drags that exit a child upward into its parent to the full subtree', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        const childText = getNoteTextNode(remdo, 'note3');
    const parentText = getNoteTextNode(remdo, 'note2');
    await dragDomSelectionBetween(childText, childText.length, parentText, 0);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note2', 'note3'],
      });
    });
  });

  it('snaps touch-handle drags across note boundaries to contiguous subtrees', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        const parentText = getNoteTextNode(remdo, 'note6');
    const childText = getNoteTextNode(remdo, 'note7');
    await dragDomSelectionBetweenRange(parentText, parentText.length, childText, childText.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note6', 'note7'],
      });
    });
  });

  it('extends pointer selections with Shift+Click to produce contiguous note ranges', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        const note2Text = getNoteTextNode(remdo, 'note2');
    const note5Text = getNoteTextNode(remdo, 'note5');
    await collapseDomSelectionAtNode(note2Text, 0);

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    });

    await extendDomSelectionToNode(note5Text, note5Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5'],
      });
    });

    await collapseDomSelectionAtNode(note5Text, note5Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note5' });
    });

    const note3Text = getNoteTextNode(remdo, 'note3');
    await extendDomSelectionToNode(note3Text, note3Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5'],
      });
    });
  });

  it('lets Shift+Click extend keyboard-driven note ranges without breaking contiguity', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteSubtree(remdo, 'note2');

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note2', 'note3'],
      });
    });

    const note5Text = getNoteTextNode(remdo, 'note5');
    await extendDomSelectionToNode(note5Text, note5Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5'],
      });
    });

    const note6Text = getNoteTextNode(remdo, 'note6');
    await extendDomSelectionToNode(note6Text, note6Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'],
      });
    });
  });

  it('keeps the ladder alive after Shift+Click tweaks to continue with directional steps', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    // Stage 2: note + descendants
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 3: extend the note range to the next sibling.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 4: hoist parent subtree
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Pointer tweak: Shift+Click (simulated via DOM extend) to include note5
    const note5Text = getNoteTextNode(remdo, 'note5');
    await extendDomSelectionToNode(note5Text, note5Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5'],
      });
    });

    // Continue ladder with directional steps after pointer tweak
    await stepSelectionLadder(remdo, 'down');

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'],
      });
    });
  });

  it('keeps Shift+Left/Right selections confined to inline content', meta({ fixture: 'flat' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'ArrowLeft', shift: true });
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });

    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    await pressKey(remdo, { key: 'ArrowRight', shift: true });
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });


  it('toggles the structural-mode class when entering and exiting structural mode', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const rootElement = getRootElementOrThrow(remdo.editor);
    const expectStructuralMode = (expected: boolean) => {
      expect(rootElement.classList.contains('editor-input--structural')).toBe(expected);
      expect(remdo.editor.selection.isStructural()).toBe(expected);
    };

    await placeCaretAtNote(remdo, 'note2');
    expectStructuralMode(false);

    await stepSelectionLadder(remdo, 'down');
    expectStructuralMode(false);

    await stepSelectionLadder(remdo, 'down');
    expectStructuralMode(true);

    await pressKey(remdo, { key: 'Escape' });
    expectStructuralMode(false);
  });


  it('treats Shift+Left/Right as no-ops once the selection spans whole notes', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');

    await stepSelectionLadder(remdo, 'down');

    // Promote selection to stage 2: note + descendants.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(remdo, { key: 'ArrowLeft', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(remdo, { key: 'ArrowRight', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('collapses a note range back to the caret when pressing Escape', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'Escape' });
    expect(remdo.editor.selection.isStructural()).toBe(false);

    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo.editor.selection.isStructural()).toBe(true);
  });

  it('treats Enter as a no-op once structural mode is active', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteSubtree(remdo, 'note2');
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'Enter' });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('treats typing as a no-op once structural mode is active', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteSubtree(remdo, 'note2');
    expect(remdo.editor.selection.isStructural()).toBe(true);

    const outlineBefore = readOutline(remdo);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    const stateBefore = remdo.editor.getEditorState();

    await typeText(remdo, 'x');
    expect(remdo.editor.selection.isStructural()).toBe(true);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    const stateAfter = remdo.editor.getEditorState();
    expect(stateAfter.toJSON()).toEqual(stateBefore.toJSON());

    expect(remdo).toMatchOutline(outlineBefore);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('runs structural indent from stage-1 inline selection', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note4');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo).toMatchSelection({ state: 'inline', note: 'note4' });

    await pressKey(remdo, { key: 'Tab' });

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            {
              noteId: 'note2',
              text: 'note2',
              children: [
                { noteId: 'note3', text: 'note3' },
                { noteId: 'note4', text: 'note4' },
              ],
            },
          ],
        },
        { noteId: 'note5', text: 'note5' },
        { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
      ]);
    });
  });

  it('reorders a stage-1 inline selection together with its subtree', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note4', text: 'note4' },
            { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          ],
        },
        { noteId: 'note5', text: 'note5' },
        { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
      ]);
    });
  });

  it('runs structural outdent from stage-1 inline selection', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note4');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo).toMatchSelection({ state: 'inline', note: 'note4' });

    await pressKey(remdo, { key: 'Tab', shift: true });

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          ],
        },
        { noteId: 'note4', text: 'note4' },
        { noteId: 'note5', text: 'note5' },
        { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
      ]);
    });
  });

  it('moves a stage-1 inline selection upward with its subtree', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note6');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo).toMatchSelection({ state: 'inline', note: 'note6' });

    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
            { noteId: 'note4', text: 'note4' },
          ],
        },
        { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
        { noteId: 'note5', text: 'note5' },
      ]);
    });
  });

  it('lets Delete remove the entire subtree on boundary entry', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteSubtree(remdo, 'note2');

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    expect(remdo).toMatchOutline(TREE_COMPLEX_OUTLINE);

    await pressKey(remdo, { key: 'Delete' });

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1', children: [{ noteId: 'note4', text: 'note4' }] },
        { noteId: 'note5', text: 'note5' },
        { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
      ]);
    });
  });

  it('lets Backspace remove the entire subtree on boundary entry', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteSubtree(remdo, 'note6');

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note6', 'note7'] });

    expect(remdo).toMatchOutline(TREE_COMPLEX_OUTLINE);

    await pressKey(remdo, { key: 'Backspace' });

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
            { noteId: 'note4', text: 'note4' },
          ],
        },
        { noteId: 'note5', text: 'note5' },
      ]);
    });
  });

  it('clears the structural highlight when navigating without modifiers', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteSubtree(remdo, 'note2');
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'ArrowRight' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
  });

  it('collapses a note range when clicking back into a note body', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteSubtree(remdo, 'note2');

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    const note4Text = getNoteTextNode(remdo, 'note4');
    await collapseDomSelectionAtNode(note4Text, 0);

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });
    });

    expect(remdo.editor.selection.isStructural()).toBe(false);
  });

  it('restores a single-note caret when navigating with plain arrows from structural mode', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'ArrowDown' });
    expect(remdo.editor.selection.isStructural()).toBe(false);

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });
  });

  it('places the caret at the leading edge when pressing ArrowLeft in structural mode', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note5');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'ArrowLeft' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note5' });
  });

  it('places the caret at the trailing edge when pressing ArrowRight in structural mode', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note5');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'ArrowRight' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note6' });
  });

  it('places the caret at the top edge when pressing ArrowUp in structural mode', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'ArrowUp' });
    expect(remdo.editor.selection.isStructural()).toBe(false);

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('lets Home/End collapse note ranges to their respective edges', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'Home' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });

    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'End' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });
  });

  it('collapses a note range when pressing PageUp/PageDown', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo.editor.selection.isStructural()).toBe(true);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    await pressKey(remdo, { key: 'PageDown' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });

    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'PageUp' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
  });

  it('lets downward step walk the progressive selection ladder', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    // Stage 2: note + descendants.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 3: siblings at the same depth.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 4: hoist to parent subtree.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Stage 5+: walk root-level siblings one at a time (per docs/specs/outliner/selection.md).
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5'] });

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'] });
  });

  const BOUNDARY_CASES: ['down' | 'up', string, string[]][] = [
    ['down', 'downward', ['note2', 'note3']],
    ['up', 'upward', ['note1', 'note2']],
  ];

  for (const [direction, word, grown] of BOUNDARY_CASES) {
    it(`treats ${word} step as a no-op at the document boundary`, meta({ fixture: 'flat' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2');

      await stepSelectionLadder(remdo, direction); // whole label
      await stepSelectionLadder(remdo, direction); // structural
      await stepSelectionLadder(remdo, direction); // extend to the neighbouring note
      expect(remdo).toMatchSelection({ state: 'structural', notes: grown });

      for (let press = 0; press < 2; press++) {
        await stepSelectionLadder(remdo, direction);
        expect(remdo).toMatchSelection({ state: 'structural', notes: grown });
      }
    });

    it(`contracts to the caret, then a fresh ${word} press starts a new ladder`, meta({ fixture: 'flat' }), async ({ remdo }) => {
      const reverse = direction === 'down' ? 'up' : 'down';
      await placeCaretAtNote(remdo, 'note2', 2);
      await stepSelectionLadder(remdo, direction);
      expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });
      // Stage 2: single-note range (anchor).
      await stepSelectionLadder(remdo, direction);
      // Stage 3: extend toward the neighbouring note.
      await stepSelectionLadder(remdo, direction);
      expect(remdo).toMatchSelection({ state: 'structural', notes: grown });

      // Reversing pops the sibling rung back to the anchor subtree.
      await stepSelectionLadder(remdo, reverse);
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });

      await stepSelectionLadder(remdo, reverse);
      expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

      await stepSelectionLadder(remdo, reverse);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
      expect(remdo.validate(() => ($getSelection() as import('lexical').RangeSelection).anchor.offset)).toBe(2);

      // At the bare caret the ladder is gone: a further step starts a fresh
      // ladder in the pressed direction, not a no-op.
      await stepSelectionLadder(remdo, direction);
      expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });
      await stepSelectionLadder(remdo, direction);
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });
      await stepSelectionLadder(remdo, direction);
      expect(remdo).toMatchSelection({ state: 'structural', notes: grown });
    });
  }

  for (const edit of ['shortened', 'replaced'] as const) {
    it(`restores a valid caret after the entry label is ${edit}`, meta({ fixture: 'flat' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2', 4);
      const entry = remdo.validate(() => {
        const selection = $getSelection() as RangeSelection;
        const point = ({ key, offset, type }: RangeSelection['anchor']) => ({ key, offset, type });
        return { restore: { anchor: point(selection.anchor), focus: point(selection.focus) }, anchorKey: getNoteKey(remdo, 'note2') };
      });
      await stepSelectionLadder(remdo, 'down');
      await stepSelectionLadder(remdo, 'down');
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });

      await remdo.mutate(() => {
        const note = $findNoteById('note2')!;
        if (edit === 'shortened') note.getAllTextNodes()[0]!.setTextContent('x');
        else note.clear().append($createTextNode('replacement'));
        $restoreInlineSelection(entry);
      });
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
      const caret = remdo.validate(() => {
        const selection = $getSelection() as RangeSelection;
        return { text: selection.anchor.getNode().getTextContent(), offset: selection.anchor.offset };
      });
      expect(caret).toEqual(edit === 'shortened' ? { text: 'x', offset: 1 } : { text: 'replacement', offset: 0 });
    });
  }

  it('contracts through the anchor subtree to the caret after sibling expansion', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    // Stage 2: anchor subtree.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 3: extend the note range to the next sibling.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stop-at-anchor: reversing pops the sibling rung back to the anchor subtree.
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('keeps the anchor when reversing directional growth after Cmd/Ctrl+A expansion', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');

    // Stage 1: inline text only.
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    // Stage 2: anchor subtree.
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 3: add the whole sibling group via Cmd/Ctrl+A.
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Further reversal retracts the whole sibling group, then the subtree.
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    // Continue popping: subtree -> inline body (no longer structural).
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });
  });

  it(
    'clamps progressive selection to the zoom root',
    meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note2' } }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2');

      await stepSelectionLadder(remdo, 'down');
      await stepSelectionLadder(remdo, 'down');
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

      await stepSelectionLadder(remdo, 'down');
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
    }
  );

  it(
    'clamps Cmd/Ctrl+A expansion to the zoom root',
    meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note2' } }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2');

      await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
      await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

      await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
    }
  );

  it('hoists the parent once downward step runs out of siblings in an existing note range', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        const note2Text = getNoteTextNode(remdo, 'note2');
    const note4Text = getNoteTextNode(remdo, 'note4');
    await dragDomSelectionBetween(note2Text, 0, note4Text, note4Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note2', 'note3', 'note4'],
      });
    });

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });
  });

  it('hoists the parent when upward step continues a pointer note range', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        const note4Text = getNoteTextNode(remdo, 'note4');
    const note2Text = getNoteTextNode(remdo, 'note2');
    await dragDomSelectionBetween(note4Text, note4Text.length, note2Text, 0);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note2', 'note3', 'note4'],
      });
    });

    await stepSelectionLadder(remdo, 'up');

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4'],
      });
    });
  });

  it('escalates downward step from a nested leaf until the document is selected', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note3');

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note3' });

    // Stage 2 promotes the nested leaf structurally.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note3'] });

    // Stage 3 would add siblings, but the ladder skips empty rungs per docs/specs/outliner/selection.md and hoists to the parent subtree (Stage 4).
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 5: include the parent's next sibling (note4) while keeping the range contiguous.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 6: hoist to the next ancestor (note1) and capture its subtree.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Stage 7+: walk root-level siblings one at a time, per docs/specs/outliner/selection.md.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5'] });

    // Selecting note6 (a parent) must automatically bring along its child note7.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'] });
  });

  it('keeps the structural highlight aligned with the selected notes', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    // TODO: simplify this regression while preserving the coverage described above.

    await placeCaretAtNote(remdo, 'note2');

    const assertVisualEnvelopeMatchesSelection = (expected: string[]) => {
      const ids = remdo.validate(() => {
        const selection = $getSelection();
        expect($isRangeSelection(selection)).toBe(true);
        const items = collectSelectedListItems(selection as Parameters<typeof collectSelectedListItems>[0]);
        if (items.length === 0) {
          throw new Error('Expected note range');
        }
        const startId = $getNoteIdOrThrow(items[0]!, 'Expected note-range noteIds');
        const endId = $getNoteIdOrThrow(items.at(-1)!, 'Expected note-range noteIds');
        return { startId, endId } as const;
      });

      expect(ids.startId).toBe(expected[0]);
      expect(ids.endId).toBe(expected.at(-1));
    };

    await stepSelectionLadder(remdo, 'down');

    // Stage 2: note2 + descendants.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
    assertVisualEnvelopeMatchesSelection(['note2', 'note3']);

    // Stage 4: parent subtree (note1..note4).
    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });
    assertVisualEnvelopeMatchesSelection(['note1', 'note2', 'note3', 'note4']);
  });

  it('stores a concrete structural range whenever structural mode is active', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectNoteSubtree(remdo, 'note2');

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
    expect(remdo.editor.selection.get()?.kind).toBe('structural');
    expect(remdo.editor.selection.get()?.range).not.toBeNull();
    expect(remdo.editor.selection.get()?.range?.headStartKey).toBe(getNoteKey(remdo, 'note2'));
    expect(remdo.editor.selection.get()?.range?.headEndKey).toBe(getNoteKey(remdo, 'note2'));
    expect(remdo.editor.selection.get()?.range?.visualStartKey).toBe(getNoteKey(remdo, 'note2'));
    expect(remdo.editor.selection.get()?.range?.visualEndKey).toBe(getNoteKey(remdo, 'note3'));

    await stepSelectionLadder(remdo, 'down');
    await stepSelectionLadder(remdo, 'down');

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });
    expect(remdo.editor.selection.get()?.kind).toBe('structural');
    expect(remdo.editor.selection.get()?.range).not.toBeNull();
    expect(remdo.editor.selection.get()?.range?.headStartKey).toBe(getNoteKey(remdo, 'note1'));
    expect(remdo.editor.selection.get()?.range?.headEndKey).toBe(getNoteKey(remdo, 'note1'));
    expect(remdo.editor.selection.get()?.range?.visualStartKey).toBe(getNoteKey(remdo, 'note1'));
    expect(remdo.editor.selection.get()?.range?.visualEndKey).toBe(getNoteKey(remdo, 'note4'));
  });

  it('recomputes outline selection from lexical state and clears malformed cached structural state', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });

    remdo.editor.selection.set({
      kind: 'structural',
      anchorKey: null,
      focusKey: null,
      range: {
        headStartKey: 'missing-key',
        headEndKey: 'missing-key',
        caretStartKey: 'missing-key',
        caretEndKey: 'missing-key',
        visualStartKey: 'missing-key',
        visualEndKey: 'missing-key',
      },
      isBackward: false,
    });

    expect(remdo.editor.selection.get()?.kind).toBe('structural');
    await placeCaretAtNote(remdo, 'note2');

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    expect(remdo.editor.selection.get()?.kind).toBe('caret');
    expect(remdo.editor.selection.get()?.range).toBeNull();
  });

  it('lets upward step walk the progressive selection ladder', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note4', 2);

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });

    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note4' });

    // Stage 2: grab the leaf structurally.
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note4'] });

    // Stage 3: include the nearest preceding sibling at this depth.
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 4: hoist to the parent subtree.
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Further upward step is a no-op at the document boundary.
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });
  });

  it('continues a directionally entered ladder with Cmd/Ctrl+A from its inline rung', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('follows the Cmd/Ctrl+A progressive selection ladder', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');

    // Stage 1: inline text only.
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    // Stage 2: note body plus its descendants.
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 3 adds the active note's siblings (and their descendants).
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 4 hoists the selection to the parent note and its subtree.
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Stage 5 selects every ancestor level until the root.
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'] });

    // Moving the caret resets the ladder back to stage 1.
    await placeCaretAtNote(remdo, 'note4');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note4' });
  });

  it('handles Cmd/Ctrl+A at the document boundary instead of falling through to default', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true }); // inline
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true }); // structural note2
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true }); // whole-document note range
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });

    // Another Cmd+A with no zoom boundary must stay handled (the command claims
    // the event and clamps to the whole document) rather than returning false and
    // letting the browser/Lexical default select-all take over. A bare
    // toMatchSelection assertion can't see the difference because the default
    // re-selects the same range — so assert the event was actually consumed.
    const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true, ctrlKey: true, cancelable: true });
    let handled = false;
    await act(async () => {
      handled = remdo.editor.dispatchCommand(SELECT_ALL_COMMAND, event);
    });

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
  });

  it('resets the Cmd/Ctrl+A ladder after placing the caret within the same note', meta({ fixture: 'flat' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });
  });

  it('skips the inline stage for whitespace-only notes on Cmd/Ctrl+A', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'space');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['space'] });
  });

  it('restores the caret in a whitespace-only note when contraction empties a directional ladder', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'space', 1);
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['space'] });

    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'caret', note: 'space' });
    expect(remdo.validate(() => ($getSelection() as RangeSelection).anchor.offset)).toBe(1);
  });

  it('skips the inline stage for empty notes with no text nodes on downward step', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'nestedEmpty');

    expect(remdo.editor.selection.isStructural()).toBe(false);

    await stepSelectionLadder(remdo, 'down');

    expect(remdo.editor.selection.isStructural()).toBe(true);
  });

  it('selects the nested empty note before child-of-empty on downward step', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'nestedEmpty');

    expect(remdo.editor.selection.isStructural()).toBe(false);

    await stepSelectionLadder(remdo, 'down');

    expect(remdo.editor.selection.isStructural()).toBe(true);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['nestedEmpty'] });
  });

  it('selects only the nested empty note on Cmd/Ctrl+A before child-of-empty', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'nestedEmpty');

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo.editor.selection.isStructural()).toBe(true);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['nestedEmpty'] });
  });

  it('keeps Cmd/Ctrl+A anchored to child-of-empty when caret is at the end', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'child', Number.POSITIVE_INFINITY);

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'inline', note: 'child' });
    });
  });

  it('selects the trailing empty note on Cmd/Ctrl+A', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'trailing');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await waitFor(() => {
      expect(remdo.editor.selection.isStructural()).toBe(true);
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['trailing'] });
    });
  });

  it('expands Cmd/Ctrl+A from a trailing empty note to its siblings', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'trailing');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['trailing'] });
    });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['alpha', 'space', 'beta', 'parent', 'nestedEmpty', 'child', 'nestedAfterChild', 'trailing'],
      });
    });
  });

  it('selects the nested empty note on upward step before the previous sibling', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'nestedAfterChild');
    await stepSelectionLadder(remdo, 'up');

    await waitFor(() => {
      expect(remdo.editor.selection.isStructural()).toBe(true);
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['nestedAfterChild'] });
    });
  });

  it('extends Shift+Click from a nested empty note to its parent', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        const nestedElement = getNoteElement(remdo, 'nestedAfterChild');
    const parentElement = getNoteElement(remdo, 'parent');

    await collapseDomSelectionAtNode(nestedElement, nestedElement.childNodes.length);

    await waitFor(() => {
      expect(readCaretNoteKey(remdo)).toBe(getNoteKey(remdo, 'nestedAfterChild'));
    });

    await extendDomSelectionToNode(parentElement, parentElement.childNodes.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['parent', 'nestedEmpty', 'child', 'nestedAfterChild'],
      });
    });
  });

  it('advances Cmd/Ctrl+A through the empty note ladder stages', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'nestedEmpty');

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['nestedEmpty'] });
    });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['nestedEmpty', 'child', 'nestedAfterChild'] });
    });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['parent', 'nestedEmpty', 'child', 'nestedAfterChild'],
      });
    });
  });

  it('returns to a caret when clicking the anchor note after a boundary no-op', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1');
    for (let press = 0; press < 5; press += 1) {
      await stepSelectionLadder(remdo, 'down');
    }
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
    });

    await stepSelectionLadder(remdo, 'down');
    const note1Text = getNoteTextNode(remdo, 'note1');
    await collapseDomSelectionAtNode(note1Text, 2);

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note1' });

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1'] });
  });

  it('returns to a caret when clicking the anchor note after Cmd/Ctrl+A at the document boundary', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1');
    for (let press = 0; press < 3; press += 1) {
      await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    }
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
    });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    const note1Text = getNoteTextNode(remdo, 'note1');
    await collapseDomSelectionAtNode(note1Text, 2);

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
    });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note1' });
  });

  it('starts an inline selection when dragging in another note after Cmd/Ctrl+A at the document boundary', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1');
    for (let press = 0; press < 4; press += 1) {
      await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    }
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
    });

    const note2Text = getNoteTextNode(remdo, 'note2');
    await dragDomSelectionBetweenRange(note2Text, 1, note2Text, 3);

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });
    });
  });

  it('restarts the ladder in another note dragged after an inline Cmd/Ctrl+A rung', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'inline', note: 'note1' });
    });

    const note3Text = getNoteTextNode(remdo, 'note3');
    await dragDomSelectionBetweenRange(note3Text, 1, note3Text, 3);
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'inline', note: 'note3' });
    });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note3' });
  });

  it('collapses a single-note range on an empty note back to a caret', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'trailing');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await waitFor(() => {
      expect(remdo.editor.selection.isStructural()).toBe(true);
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['trailing'] });
    });

    await pressKey(remdo, { key: 'Escape' });

    await waitFor(() => {
      expect(readCaretNoteKey(remdo)).toBe(getNoteKey(remdo, 'trailing'));
    });
  });

  // Expected: a directional step starting on an empty parent note selects the full parent subtree.
  it('selects the full subtree when a directional step starts on an empty parent note', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'parent');
    await stepSelectionLadder(remdo, 'down');

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['parent', 'nestedEmpty', 'child', 'nestedAfterChild'],
      });
    });

    await placeCaretAtNote(remdo, 'parent');
    await stepSelectionLadder(remdo, 'up');

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['parent', 'nestedEmpty', 'child', 'nestedAfterChild'],
      });
    });
  });

  // Expected: Shift+Left/Right are inline-only and remain no-ops on empty notes (no note range).
  it('keeps Shift+Left/Right as no-ops on an empty note', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'parent');
    expect(readCaretNoteKey(remdo)).toBe(getNoteKey(remdo, 'parent'));
    expect(remdo.editor.selection.isStructural()).toBe(false);

    await pressKey(remdo, { key: 'ArrowRight', shift: true });
    await pressKey(remdo, { key: 'ArrowLeft', shift: true });

    expect(readCaretNoteKey(remdo)).toBe(getNoteKey(remdo, 'parent'));
    expect(remdo.editor.selection.isStructural()).toBe(false);
  });

  it('snaps mixed empty/non-empty ranges into a contiguous note range', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        const betaText = getNoteTextNode(remdo, 'beta');
    const emptyTail = getNoteElement(remdo, 'nestedAfterChild');

    await dragDomSelectionBetween(betaText, 1, emptyTail, emptyTail.childNodes.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['beta', 'parent', 'nestedEmpty', 'child', 'nestedAfterChild'],
      });
    });
  });

  it('skips the sibling stage when Cmd/Ctrl+A climbs from a siblingless note', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note7');

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note7' });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note7' });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note6', 'note7'] });
  });

  it('keeps the progressive ladder in sync when mixing directional steps and Cmd/Ctrl+A', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5'] });
  });

  it('keeps Cmd/Ctrl+A direction-neutral after an upward selection sweep', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note4');
    await stepSelectionLadder(remdo, 'up');
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note4'] });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Either arrow grows from Select All; the subsequent opposite arrow reverses it.
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('expands Cmd/Ctrl+A the same whether or not a prior sweep ran', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Fresh Cmd+A.
    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });

    // Same anchor, but an upward sweep first — Cmd+A reaches the same note range.
    await placeCaretAtNote(remdo, 'note2');
    await stepSelectionLadder(remdo, 'up');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
  });

  it(
    'adds all in-zoom siblings of the anchor with Cmd/Ctrl+A',
    meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note1' } }),
    async ({ remdo }) => {
      // Zoomed into note1, whose children are note2 (→note3) and note4 — both
      // inside the zoom. From note2, Cmd+A must grab the whole sibling
      // group (note2, note4 + subtrees), never skipping note4.
      await placeCaretAtNote(remdo, 'note2');
      await pressKey(remdo, { key: 'a', ctrlOrMeta: true }); // inline
      await pressKey(remdo, { key: 'a', ctrlOrMeta: true }); // note2 subtree
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
      await pressKey(remdo, { key: 'a', ctrlOrMeta: true }); // whole sibling group
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
    }
  );

  for (const direction of ['up', 'down'] as const) {
    it(`grows the Cmd/Ctrl+A inline rung ${direction} before reversing to a caret`, meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2');
      await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
      expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

      await stepSelectionLadder(remdo, direction);
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
      await stepSelectionLadder(remdo, direction);
      expect(remdo).toMatchSelection({ state: 'structural', notes: direction === 'up'
        ? ['note1', 'note2', 'note3', 'note4'] : ['note2', 'note3', 'note4'] });

      const reverse = direction === 'up' ? 'down' : 'up';
      await stepSelectionLadder(remdo, reverse);
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
      await stepSelectionLadder(remdo, reverse);
      expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });
      await stepSelectionLadder(remdo, reverse);
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    });

    it(`keeps a whole-document Cmd/Ctrl+A range at the ${direction} boundary`, meta({ fixture: 'flat' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2');
      for (let press = 0; press < 3; press++) await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
      await stepSelectionLadder(remdo, direction);
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
    });

    it(`keeps Cmd/Ctrl+A neutral after a ${direction} sweep at the document boundary`, meta({ fixture: 'flat' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, direction === 'up' ? 'note3' : 'note1');
      for (let press = 0; press < 4; press++) await stepSelectionLadder(remdo, direction);
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
      await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
      const reverse = direction === 'up' ? 'down' : 'up';
      for (let press = 0; press < 2; press++) {
        await stepSelectionLadder(remdo, reverse);
        expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
      }
    });
  }

  it('preserves pointer ladder contraction and regrowth after an upward drag', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // Drag from note2 UP to note1: the Lexical anchor is note2 (the lower note),
    // the focus is note1, so the seeded ladder is anchored at note2 sweeping up.
    const note2Text = getNoteTextNode(remdo, 'note2');
    const note1Text = getNoteTextNode(remdo, 'note1');
    await dragDomSelectionBetween(note2Text, 0, note1Text, 0);

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
    });

    // Reversing (downward step, opposite of the up-sweep) contracts toward the
    // anchor note2 — consistent with a keyboard up-sweep then downward step, and
    // with the symmetric pointer test that continues upward with upward step.
    await stepSelectionLadder(remdo, 'down');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });

    // Pointer ladders retain their existing subtree step before sibling growth.
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });
    await stepSelectionLadder(remdo, 'up');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
  });
});
