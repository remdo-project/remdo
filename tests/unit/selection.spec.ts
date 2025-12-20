import { act, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Outline } from '#tests';
import {
  collectSelectedListItems,
  getListItemLabel,
  placeCaretAtNote,
  pressKey,
  readOutline,
  typeText,
} from '#tests';
import type { ListItemNode, ListNode } from '@lexical/list';
import { $getNodeByKey, $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { REORDER_NOTES_DOWN_COMMAND, REORDER_NOTES_UP_COMMAND } from '@/editor/commands';

const TREE_COMPLEX_OUTLINE: Outline = [
  {
    text: 'note1',
    children: [
      { text: 'note2', children: [{ text: 'note3' }] },
      { text: 'note4' },
    ],
  },
  { text: 'note5' },
  { text: 'note6', children: [{ text: 'note7' }] },
];

// Ensures every multi-note selection matches the guarantees from docs/outliner/selection.md:
// once a selection crosses a note boundary it must cover a contiguous block of
// whole notes plus their subtrees, with no gaps or orphaned descendants.
async function dragDomSelectionBetween(start: Text, startOffset: number, end: Text, endOffset: number) {
  await mutateDomSelection((selection) => {
    const range = document.createRange();
    const normalizedStart = clampOffset(start, startOffset);
    const normalizedEnd = clampOffset(end, endOffset);

    range.setStart(start, normalizedStart);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    if (typeof selection.extend === 'function') {
      selection.extend(end, normalizedEnd);
    } else {
      const ordered = orderRangePoints(start, normalizedStart, end, normalizedEnd);
      const dragRange = document.createRange();
      dragRange.setStart(ordered.startNode, ordered.startOffset);
      dragRange.setEnd(ordered.endNode, ordered.endOffset);
      selection.removeAllRanges();
      selection.addRange(dragRange);
    }
  });
}

async function dragDomSelectionWithoutExtendBetween(start: Text, startOffset: number, end: Text, endOffset: number) {
  await mutateDomSelection(() => {
    const { startNode, startOffset: normalizedStart, endNode, endOffset: normalizedEnd } = orderRangePoints(
      start,
      clampOffset(start, startOffset),
      end,
      clampOffset(end, endOffset)
    );
    const range = document.createRange();
    range.setStart(startNode, normalizedStart);
    range.setEnd(endNode, normalizedEnd);
    const selection = getDomSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

async function collapseDomSelectionAtText(target: Text, offset: number) {
  await mutateDomSelection((selection) => {
    const caretRange = document.createRange();
    const clamped = clampOffset(target, offset);
    caretRange.setStart(target, clamped);
    caretRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caretRange);
  });
}

async function extendDomSelectionToText(target: Text, offset: number) {
  await mutateDomSelection((selection) => {
    if (selection.rangeCount === 0) {
      throw new Error('Cannot extend selection without an existing anchor');
    }

    const clamped = clampOffset(target, offset);
    selection.extend(target, clamped);
  });
}

function getNoteTextNode(rootElement: HTMLElement, label: string): Text {
  const noteElement = within(rootElement).getByText(
    (_, node) => {
      if (!node) {
        return false;
      }
      return node.textContent === label;
    },
    { selector: '[data-lexical-text="true"]' }
  );
  const walker = document.createTreeWalker(noteElement, NodeFilter.SHOW_TEXT);
  const textNode = walker.nextNode();
  if (!(textNode instanceof Text)) {
    throw new TypeError(`Expected text node for note: ${label}`);
  }
  return textNode;
}

function clampOffset(node: Text, offset: number): number {
  const length = node.length;
  return Math.max(0, Math.min(offset, length));
}

function getDomSelection(): Selection {
  const selection = globalThis.getSelection();
  if (!selection) {
    throw new Error('DOM selection is unavailable');
  }
  return selection;
}

async function mutateDomSelection(mutator: (selection: Selection) => void) {
  await act(async () => {
    const rootElement = document.querySelector('[data-remdo-editor="true"]');
    if (rootElement instanceof HTMLElement && document.activeElement !== rootElement) {
      rootElement.focus();
    }
    mutator(getDomSelection());
    document.dispatchEvent(new Event('selectionchange'));
  });
}

function orderRangePoints(
  anchorNode: Node,
  anchorOffset: number,
  focusNode: Node,
  focusOffset: number
): { startNode: Node; startOffset: number; endNode: Node; endOffset: number } {
  if (anchorNode === focusNode) {
    return anchorOffset <= focusOffset
      ? { startNode: anchorNode, startOffset: anchorOffset, endNode: focusNode, endOffset: focusOffset }
      : { startNode: focusNode, startOffset: focusOffset, endNode: anchorNode, endOffset: anchorOffset };
  }

  const position = anchorNode.compareDocumentPosition(focusNode);
  const isAnchorBeforeFocus =
    position & Node.DOCUMENT_POSITION_PRECEDING
      ? false
      : position & Node.DOCUMENT_POSITION_FOLLOWING
        ? true
        : anchorOffset <= focusOffset;

  if (isAnchorBeforeFocus) {
    return { startNode: anchorNode, startOffset: anchorOffset, endNode: focusNode, endOffset: focusOffset };
  }

  return { startNode: focusNode, startOffset: focusOffset, endNode: anchorNode, endOffset: anchorOffset };
}

describe('selection plugin', () => {
  it('snaps pointer drags across note boundaries to contiguous structural slices', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    const note2Text = getNoteTextNode(rootElement, 'note2');
    const note5Text = getNoteTextNode(rootElement, 'note5');
    await dragDomSelectionBetween(note2Text, 1, note5Text, 1);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5'],
      });
    });

    const note6Text = getNoteTextNode(rootElement, 'note6');
    const note7Text = getNoteTextNode(rootElement, 'note7');
    await dragDomSelectionBetween(note6Text, 0, note7Text, note7Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note6', 'note7'],
      });
    });
  });

  it('preserves selection direction for backward pointer drags', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    const note5Text = getNoteTextNode(rootElement, 'note5');
    const note2Text = getNoteTextNode(rootElement, 'note2');
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

  it('snaps drags that cross from a parent into its child to the full subtree', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    const parentText = getNoteTextNode(rootElement, 'note2');
    const childText = getNoteTextNode(rootElement, 'note3');
    await dragDomSelectionBetween(parentText, parentText.length, childText, 1);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note2', 'note3'],
      });
    });
  });

  it('snaps drags that exit a child upward into its parent to the full subtree', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    const childText = getNoteTextNode(rootElement, 'note3');
    const parentText = getNoteTextNode(rootElement, 'note2');
    await dragDomSelectionBetween(childText, childText.length, parentText, 0);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note2', 'note3'],
      });
    });
  });

  it('snaps touch-handle drags across note boundaries to contiguous subtrees', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    const parentText = getNoteTextNode(rootElement, 'note6');
    const childText = getNoteTextNode(rootElement, 'note7');
    await dragDomSelectionWithoutExtendBetween(parentText, parentText.length, childText, childText.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note6', 'note7'],
      });
    });
  });

  it('extends pointer selections with Shift+Click to produce contiguous note ranges', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    const note2Text = getNoteTextNode(rootElement, 'note2');
    const note5Text = getNoteTextNode(rootElement, 'note5');
    await collapseDomSelectionAtText(note2Text, 0);

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    });

    await extendDomSelectionToText(note5Text, note5Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5'],
      });
    });

    await collapseDomSelectionAtText(note5Text, note5Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note5' });
    });

    const note3Text = getNoteTextNode(rootElement, 'note3');
    await extendDomSelectionToText(note3Text, note3Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5'],
      });
    });
  });

  it('lets Shift+Click extend keyboard-driven structural selections without breaking contiguity', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note2', 'note3'],
      });
    });

    const note5Text = getNoteTextNode(rootElement, 'note5');
    await extendDomSelectionToText(note5Text, note5Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5'],
      });
    });

    const note6Text = getNoteTextNode(rootElement, 'note6');
    await extendDomSelectionToText(note6Text, note6Text.length);

    await waitFor(() => {
      expect(remdo).toMatchSelection({
        state: 'structural',
        notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'],
      });
    });
  });

  it('keeps the ladder alive after Shift+Click tweaks to continue with Shift+Arrow', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

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
    const note5Text = getNoteTextNode(rootElement, 'note5');
    await extendDomSelectionToText(note5Text, note5Text.length);

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

  it('keeps Shift+Left/Right selections confined to inline content', async ({ remdo }) => {
    await remdo.load('flat');

    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'ArrowLeft', shift: true });
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });

    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
    await pressKey(remdo, { key: 'ArrowRight', shift: true });
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('treats Shift+Left/Right as no-ops once the selection spans whole notes', async ({ remdo }) => {
    await remdo.load('tree_complex');

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

  it('toggles the structural selection dataset when escalating the ladder', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note2');
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await placeCaretAtNote(remdo, 'note1');
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
  });

  it('collapses structural selection back to the caret when pressing Escape', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(remdo, { key: 'Escape' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');
  });

  it('treats Enter as a no-op once structural selection is active', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(remdo, { key: 'Enter' });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('treats typing as a no-op once structural selection is active', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    const outlineBefore = readOutline(remdo);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    const stateBefore = remdo.editor.getEditorState();

    await typeText(remdo, 'x');
    expect(rootElement.dataset.structuralSelection).toBe('true');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    const stateAfter = remdo.editor.getEditorState();
    expect(stateAfter.toJSON()).toEqual(stateBefore.toJSON());

    expect(remdo).toMatchOutline(outlineBefore);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('runs structural indent from stage-1 inline selection', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note4');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo).toMatchSelection({ state: 'inline', note: 'note4' });

    await pressKey(remdo, { key: 'Tab' });

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            {
              text: 'note2',
              children: [
                { text: 'note3' },
                { text: 'note4' },
              ],
            },
          ],
        },
        { text: 'note5' },
        { text: 'note6', children: [{ text: 'note7' }] },
      ]);
    });
  });

  it('reorders a stage-1 inline selection together with its subtree', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            { text: 'note4' },
            { text: 'note2', children: [{ text: 'note3' }] },
          ],
        },
        { text: 'note5' },
        { text: 'note6', children: [{ text: 'note7' }] },
      ]);
    });
  });

  it('runs structural outdent from stage-1 inline selection', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note4');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo).toMatchSelection({ state: 'inline', note: 'note4' });

    await pressKey(remdo, { key: 'Tab', shift: true });

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            { text: 'note2', children: [{ text: 'note3' }] },
          ],
        },
        { text: 'note4' },
        { text: 'note5' },
        { text: 'note6', children: [{ text: 'note7' }] },
      ]);
    });
  });

  it('moves a stage-1 inline selection upward with its subtree', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note6');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo).toMatchSelection({ state: 'inline', note: 'note6' });

    await remdo.dispatchCommand(REORDER_NOTES_UP_COMMAND);

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            { text: 'note2', children: [{ text: 'note3' }] },
            { text: 'note4' },
          ],
        },
        { text: 'note6', children: [{ text: 'note7' }] },
        { text: 'note5' },
      ]);
    });
  });

  it('lets Delete remove the entire subtree at stage 2 of the progressive ladder', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    expect(remdo).toMatchOutline(TREE_COMPLEX_OUTLINE);

    await pressKey(remdo, { key: 'Delete' });

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        { text: 'note1', children: [{ text: 'note4' }] },
        { text: 'note5' },
        { text: 'note6', children: [{ text: 'note7' }] },
      ]);
    });
  });

  it('lets Backspace remove the entire subtree at stage 2 of the progressive ladder', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note6');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note6', 'note7'] });

    expect(remdo).toMatchOutline(TREE_COMPLEX_OUTLINE);

    await pressKey(remdo, { key: 'Backspace' });

    await waitFor(() => {
      expect(remdo).toMatchOutline([
        {
          text: 'note1',
          children: [
            { text: 'note2', children: [{ text: 'note3' }] },
            { text: 'note4' },
          ],
        },
        { text: 'note5' },
      ]);
    });
  });

  it('clears the structural highlight when navigating without modifiers', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(remdo, { key: 'ArrowRight' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
  });

  it('collapses structural selection when clicking back into a note body', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    const note4Text = getNoteTextNode(rootElement, 'note4');
    await collapseDomSelectionAtText(note4Text, 0);

    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });
    });

    expect(rootElement.dataset.structuralSelection).toBeUndefined();
  });

  it('restores a single-note caret when navigating with plain arrows from structural mode', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(remdo, { key: 'ArrowDown' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });
  });

  it('places the caret at the leading edge when pressing ArrowLeft in structural mode', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note5');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(remdo, { key: 'ArrowLeft' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note5' });
  });

  it('places the caret at the trailing edge when pressing ArrowRight in structural mode', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note5');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(remdo, { key: 'ArrowRight' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note6' });
  });

  it('places the caret at the top edge when pressing ArrowUp in structural mode', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(remdo, { key: 'ArrowUp' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('lets Home/End collapse structural selections to their respective edges', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(remdo, { key: 'Home' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(remdo, { key: 'End' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });
  });

  it('collapses structural selection when pressing PageUp/PageDown', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    await pressKey(remdo, { key: 'PageDown' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note4' });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(remdo, { key: 'PageUp' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('lets Shift+Down walk the progressive selection ladder', async ({ remdo }) => {
    await remdo.load('tree_complex');

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

  it('hoists the parent once Shift+Down runs out of siblings in an existing note range', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    const note2Text = getNoteTextNode(rootElement, 'note2');
    const note4Text = getNoteTextNode(rootElement, 'note4');
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

  it('hoists the parent when Shift+Up continues a pointer selection slab', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    const note4Text = getNoteTextNode(rootElement, 'note4');
    const note2Text = getNoteTextNode(rootElement, 'note2');
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

  it('escalates Shift+Down from a nested leaf until the document is selected', async ({ remdo }) => {
    await remdo.load('tree_complex');

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

  it('keeps the structural highlight aligned with the selected notes', async ({ remdo }) => {
    // TODO: simplify this regression while preserving the coverage described above.
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note2');

    const assertVisualEnvelopeMatchesSelection = (expected: string[]) => {
      const labels = remdo.validate(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          throw new Error('Expected a range selection');
        }
        const items = collectSelectedListItems(selection);
        if (items.length === 0) {
          throw new Error('Expected structural selection');
        }
        const startLabel = getListItemLabel(items[0]!);
        const endLabel = getListItemLabel(items.at(-1)!);
        if (!startLabel || !endLabel) {
          throw new Error('Expected structural selection labels');
        }
        return { startLabel, endLabel } as const;
      });

      expect(labels.startLabel).toBe(expected[0]);
      expect(labels.endLabel).toBe(expected.at(-1));
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

  it('marks structural selection once Shift+Down reaches stage 2 even for leaf notes', async ({ remdo }) => {
    await remdo.load('tree_complex');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, 'note4');
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    // Stage 1 should stay unstructured.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    // Stage 2 should flip the structural dataset for leaf notes so the UI highlights the block.
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');
  });

  it('selects nested leaves structurally at Shift+Down stage 2', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note3');
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note3'] });
  });

  it('skips the sibling stage when Shift+Down reaches a siblingless note', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note7');

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note7' });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note7' });

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note7'] });
  });

  it('lets Shift+Up walk the progressive selection ladder', async ({ remdo }) => {
    await remdo.load('tree_complex');

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

  it('selects leaf notes structurally at Shift+Up stage 2', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note4', 2);
    await pressKey(remdo, { key: 'ArrowUp', shift: true });
    await pressKey(remdo, { key: 'ArrowUp', shift: true });

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note4'] });
  });

  it('follows the Cmd/Ctrl+A progressive selection ladder', async ({ remdo }) => {
    await remdo.load('tree_complex');

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

  it('skips the inline stage for whitespace-only notes on Cmd/Ctrl+A', async ({ remdo }) => {
    await remdo.load('empty-labels');

    await placeCaretAtNote(remdo, ' ');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    expect(remdo).toMatchSelection({ state: 'structural', notes: [' '] });
  });

  it('skips the inline stage for empty notes with no text nodes on Shift+Down', async ({ remdo }) => {
    await remdo.load('empty-labels');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote(remdo, '');

    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    expect(rootElement.dataset.structuralSelection).toBe('true');
    const isCollapsed = remdo.validate(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection) ? selection.isCollapsed() : true;
    });
    expect(isCollapsed).toBe(false);
  });

  it('selects the nested empty note before child-of-empty on Shift+Down', async ({ remdo }) => {
    await remdo.load('empty-labels');

    const rootElement = remdo.editor.getRootElement()!;

    const { emptyKey } = remdo.validate(() => {
      const list = $getRoot().getFirstChild() as ListNode;
      // empty-labels fixture: list item 5 nests [empty, child-of-empty]
      const nested = list.getChildren<ListItemNode>()[4]!.getChildren<ListNode>()[0]!;
      const empty = nested.getChildren<ListItemNode>()[0]!;
      return { emptyKey: empty.getKey() };
    });

    await remdo.mutate(() => {
      const node = $getNodeByKey<ListItemNode>(emptyKey)!;
      node.selectStart();
    });

    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await pressKey(remdo, { key: 'ArrowDown', shift: true });

    // TODO: extend toMatchSelection to assert structural selection by stable keys.
    // Today we lean on dataset structuralSelectionKeys (plugin internals) because empty notes
    // have no labels and are invisible to the matcher, which isn't part of the contract.
    expect(rootElement.dataset.structuralSelection).toBe('true');
    expect(rootElement.dataset.structuralSelectionKeys?.split(',')).toContain(emptyKey);

    const isCollapsed = remdo.validate(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection) ? selection.isCollapsed() : true;
    });
    expect(isCollapsed).toBe(false);
  });

  it('selects only the nested empty note on Cmd/Ctrl+A before child-of-empty', async ({ remdo }) => {
    await remdo.load('empty-labels');

    const rootElement = remdo.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    const { emptyKey, childKey } = remdo.validate(() => {
      const list = $getRoot().getFirstChild() as ListNode;
      // empty-labels fixture: list item 5 nests [empty, child-of-empty]
      const nested = list.getChildren<ListItemNode>()[4]!.getChildren<ListNode>()[0]!;
      const empty = nested.getChildren<ListItemNode>()[0]!;
      const child = nested.getChildren<ListItemNode>()[1]!;
      return { emptyKey: empty.getKey(), childKey: child.getKey() };
    });

    await remdo.mutate(() => {
      const node = $getNodeByKey<ListItemNode>(emptyKey) as ListItemNode;
      node.selectStart();
    });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    // TODO: extend toMatchSelection to assert structural selection by stable keys.
    // Today we lean on dataset structuralSelectionKeys (plugin internals) because empty notes
    // have no labels and are invisible to the matcher, which isn't part of the contract.
    expect(rootElement.dataset.structuralSelection).toBe('true');
    const selectedKeys = rootElement.dataset.structuralSelectionKeys?.split(',') ?? [];
    expect(selectedKeys).toContain(emptyKey);
    expect(selectedKeys).not.toContain(childKey);
  });

  it('skips the sibling stage when Cmd/Ctrl+A climbs from a siblingless note', async ({ remdo }) => {
    await remdo.load('tree_complex');

    await placeCaretAtNote(remdo, 'note7');

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note7' });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note7' });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });

    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note6', 'note7'] });
  });

  it('keeps the progressive ladder in sync when mixing Shift+Arrow and Cmd/Ctrl+A', async ({ remdo }) => {
    await remdo.load('tree_complex');

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
