import { waitFor } from '@testing-library/react';
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
  getNoteKey,
  readCaretNoteKey,
  pressKey,
  readOutline,
  typeText,
  meta,
} from '#tests';
import { $getSelection, $isRangeSelection } from 'lexical';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND } from '@/editor/commands';

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
      if (!$isRangeSelection(selection)) {
        throw new Error('Expected range selection');
      }
      return selection.isBackward();
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

  it('lets Shift+Click extend keyboard-driven structural selections without breaking contiguity', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

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

  it('keeps the ladder alive after Shift+Click tweaks to continue with Shift+Arrow', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');

    // Stage 1: inline
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    // Stage 2: note + descendants
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 3: siblings slab
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 4: hoist parent subtree
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
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

    // Continue ladder with Shift+Arrow after pointer tweak
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

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


  it('toggles the structural selection class when entering and exiting structural mode', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        const rootElement = getRootElementOrThrow(remdo.editor);

    await placeCaretAtNote(remdo, 'note2');
    expect(rootElement.classList.contains('editor-input--structural')).toBe(false);

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.classList.contains('editor-input--structural')).toBe(true);

    await pressKey(remdo, { key: 'Escape' });
    expect(rootElement.classList.contains('editor-input--structural')).toBe(false);
  });


  it('treats Shift+Left/Right as no-ops once the selection spans whole notes', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');

    // Promote selection to stage 2: note + descendants.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(remdo, { key: 'ArrowLeft', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(remdo, { key: 'ArrowRight', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('toggles the structural selection state when escalating the ladder', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    expect(remdo.editor.selection.isStructural()).toBe(false);

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(false);

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await placeCaretAtNote(remdo, 'note1');
    expect(remdo.editor.selection.isStructural()).toBe(false);
  });

  it('collapses structural selection back to the caret when pressing Escape', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'Escape' });
    expect(remdo.editor.selection.isStructural()).toBe(false);

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(false);

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);
  });

  it('treats Enter as a no-op once structural selection is active', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'Enter' });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('treats typing as a no-op once structural selection is active', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
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

  it('lets Delete remove the entire subtree at stage 2 of the progressive ladder', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

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

  it('lets Backspace remove the entire subtree at stage 2 of the progressive ladder', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note6');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

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
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'ArrowRight' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
  });

  it('collapses structural selection when clicking back into a note body', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

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
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'ArrowDown' });
    expect(remdo.editor.selection.isStructural()).toBe(false);

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });
  });

  it('places the caret at the leading edge when pressing ArrowLeft in structural mode', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note5');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'ArrowLeft' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note5' });
  });

  it('places the caret at the trailing edge when pressing ArrowRight in structural mode', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note5');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'ArrowRight' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note6' });
  });

  it('places the caret at the top edge when pressing ArrowUp in structural mode', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'ArrowUp' });
    expect(remdo.editor.selection.isStructural()).toBe(false);

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('lets Home/End collapse structural selections to their respective edges', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'Home' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'End' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });
  });

  it('collapses structural selection when pressing PageUp/PageDown', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    await pressKey(remdo, { key: 'PageDown' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);

    await pressKey(remdo, { key: 'PageUp' });
    expect(remdo.editor.selection.isStructural()).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('lets Shift+Down walk the progressive selection ladder', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');

    // Stage 1: inline body only.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    // Stage 2: note + descendants.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 3: siblings at the same depth.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 4: hoist to parent subtree.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Stage 5+: walk root-level siblings one at a time (per docs/outliner/selection.md).
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5'] });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'] });
  });

  it('hoists the parent once Shift+Down runs out of siblings in an existing note range', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        const note2Text = getNoteTextNode(remdo, 'note2');
    const note4Text = getNoteTextNode(remdo, 'note4');
    await dragDomSelectionBetween(note2Text, 0, note4Text, note4Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note2', 'note3', 'note4'],
      });
    });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });
  });

  it('hoists the parent when Shift+Up continues a pointer selection slab', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        const note4Text = getNoteTextNode(remdo, 'note4');
    const note2Text = getNoteTextNode(remdo, 'note2');
    await dragDomSelectionBetween(note4Text, note4Text.length, note2Text, 0);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note2', 'note3', 'note4'],
      });
    });

    await pressKey(remdo, { key: 'ArrowUp', shift: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4'],
      });
    });
  });

  it('escalates Shift+Down from a nested leaf until the document is selected', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note3');

    // Stage 1 (docs/outliner/selection.md): inline body only.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note3' });

    // Stage 2 promotes the nested leaf structurally.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note3'] });

    // Stage 3 would add siblings, but the ladder skips empty rungs per docs/outliner/selection.md and hoists to the parent subtree (Stage 4).
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 5: include the parent's next sibling (note4) while keeping the range contiguous.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 6: hoist to the next ancestor (note1) and capture its subtree.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Stage 7+: walk root-level siblings one at a time, per docs/outliner/selection.md.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5'] });

    // Selecting note6 (a parent) must automatically bring along its child note7.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'] });
  });

  it('keeps the structural highlight aligned with the selected notes', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    // TODO: simplify this regression while preserving the coverage described above.

    await placeCaretAtNote(remdo, 'note2');

    const assertVisualEnvelopeMatchesSelection = (expected: string[]) => {
      const ids = remdo.validate(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          throw new Error('Expected a range selection');
        }
        const items = collectSelectedListItems(selection);
        if (items.length === 0) {
          throw new Error('Expected structural selection');
        }
        const startId = $getNoteIdOrThrow(items[0]!, 'Expected structural selection noteIds');
        const endId = $getNoteIdOrThrow(items.at(-1)!, 'Expected structural selection noteIds');
        return { startId, endId } as const;
      });

      expect(ids.startId).toBe(expected[0]);
      expect(ids.endId).toBe(expected.at(-1));
    };

    // Stage 2: note2 + descendants.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
    assertVisualEnvelopeMatchesSelection(['note2', 'note3']);

    // Stage 4: parent subtree (note1..note4).
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });
    assertVisualEnvelopeMatchesSelection(['note1', 'note2', 'note3', 'note4']);
  });

  it('marks structural selection once Shift+Down reaches stage 2 even for leaf notes', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note4');
    expect(remdo.editor.selection.isStructural()).toBe(false);

    // Stage 1 should stay unstructured.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(false);

    // Stage 2 should flip structural selection for leaf notes so the UI highlights the block.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo.editor.selection.isStructural()).toBe(true);
  });

  it('selects nested leaves structurally at Shift+Down stage 2', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note3');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note3'] });
  });

  it('skips the sibling stage when Shift+Down reaches a siblingless note', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note7');

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note7' });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note7' });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note7'] });
  });

  it('lets Shift+Up walk the progressive selection ladder', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note4', 2);

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });

    // Stage 1: inline body only.
    await pressKey(remdo, { key: 'ArrowUp', shift: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note4' });

    // Stage 2: grab the leaf structurally.
    await pressKey(remdo, { key: 'ArrowUp', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note4'] });

    // Stage 3: include the nearest preceding sibling at this depth.
    await pressKey(remdo, { key: 'ArrowUp', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 4: hoist to the parent subtree.
    await pressKey(remdo, { key: 'ArrowUp', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Stage 5+: walk root-level siblings upward one at a time, then finish the ladder.
    await pressKey(remdo, { key: 'ArrowUp', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5'] });

    await pressKey(remdo, { key: 'ArrowUp', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'] });
  });

  it('selects leaf notes structurally at Shift+Up stage 2', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note4', 2);
    await pressKey(remdo, { key: 'ArrowUp', shift: true });
    await pressKey(remdo, { key: 'ArrowUp', shift: true });

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note4'] });
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

  it('skips the inline stage for empty notes with no text nodes on Shift+Down', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'nested-empty');

    expect(remdo.editor.selection.isStructural()).toBe(false);

    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    expect(remdo.editor.selection.isStructural()).toBe(true);
  });

  it('selects the nested empty note before child-of-empty on Shift+Down', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'nested-empty');

    expect(remdo.editor.selection.isStructural()).toBe(false);

    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    expect(remdo.editor.selection.isStructural()).toBe(true);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['nested-empty'] });
  });

  it('selects only the nested empty note on Cmd/Ctrl+A before child-of-empty', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'nested-empty');

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo.editor.selection.isStructural()).toBe(true);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['nested-empty'] });
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
        notes: ['alpha', 'space', 'beta', 'parent', 'nested-empty', 'child', 'nested-after-child', 'trailing'],
      });
    });
  });

  it('selects the nested empty note on Shift+Up before the previous sibling', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'nested-after-child');
    await pressKey(remdo, { key: 'ArrowUp', shift: true });

    await waitFor(() => {
      expect(remdo.editor.selection.isStructural()).toBe(true);
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['nested-after-child'] });
    });
  });

  it('extends Shift+Click from a nested empty note to its parent', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        const nestedElement = getNoteElement(remdo, 'nested-after-child');
    const parentElement = getNoteElement(remdo, 'parent');

    await collapseDomSelectionAtNode(nestedElement, nestedElement.childNodes.length);

    await waitFor(() => {
      expect(readCaretNoteKey(remdo)).toBe(getNoteKey(remdo, 'nested-after-child'));
    });

    await extendDomSelectionToNode(parentElement, parentElement.childNodes.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['parent', 'nested-empty', 'child', 'nested-after-child'],
      });
    });
  });

  it('advances Cmd/Ctrl+A through the empty note ladder stages', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'nested-empty');

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['nested-empty'] });
    });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['nested-empty', 'child', 'nested-after-child'] });
    });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['parent', 'nested-empty', 'child', 'nested-after-child'],
      });
    });
  });

  it('collapses structural selection on an empty note back to a caret', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
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

  // Expected: Shift+Down/Up starting on an empty parent note selects the full parent subtree.
  it('selects the full subtree when Shift+Down/Up starts on an empty parent note', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'parent');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['parent', 'nested-empty', 'child', 'nested-after-child'],
      });
    });

    await placeCaretAtNote(remdo, 'parent');
    await pressKey(remdo, { key: 'ArrowUp', shift: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['parent', 'nested-empty', 'child', 'nested-after-child'],
      });
    });
  });

  // Expected: Shift+Left/Right are inline-only and remain no-ops on empty notes (no structural selection).
  it('keeps Shift+Left/Right as no-ops on an empty note', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'parent');
    expect(readCaretNoteKey(remdo)).toBe(getNoteKey(remdo, 'parent'));
    expect(remdo.editor.selection.isStructural()).toBe(false);

    await pressKey(remdo, { key: 'ArrowRight', shift: true });
    await pressKey(remdo, { key: 'ArrowLeft', shift: true });

    expect(readCaretNoteKey(remdo)).toBe(getNoteKey(remdo, 'parent'));
    expect(remdo.editor.selection.isStructural()).toBe(false);
  });

  it('snaps mixed empty/non-empty ranges into a contiguous structural selection', meta({ fixture: 'empty-labels' }), async ({ remdo }) => {
        const betaText = getNoteTextNode(remdo, 'beta');
    const emptyTail = getNoteElement(remdo, 'nested-after-child');

    await dragDomSelectionBetween(betaText, 1, emptyTail, emptyTail.childNodes.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['beta', 'parent', 'nested-empty', 'child', 'nested-after-child'],
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

  it('keeps the progressive ladder in sync when mixing Shift+Arrow and Cmd/Ctrl+A', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5'] });
  });
});
