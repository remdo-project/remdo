import { act, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

import type { RemdoTestApi } from '@/editor/plugins/dev';
import { readOutline, placeCaretAtNoteId, selectRangeSelectionById } from './note';
import { pressKey } from './keyboard';
import { getNoteElementById } from './dom-note';

// Low-level DOM drag helper for precise text-node range selection.
// Limitations: bypasses Lexical selection APIs and only works with live DOM nodes.
export async function dragDomSelectionBetween(start: Node, startOffset: number, end: Node, endOffset: number) {
  await mutateDomSelection((selection) => {
    const range = document.createRange();
    const normalizedStart = clampDomOffset(start, startOffset);
    const normalizedEnd = clampDomOffset(end, endOffset);

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

// DOM list-item boundary selection for pointer-style multi-note selection.
// Limitations: requires sibling notes under the same list parent and can over-select
// in nested lists due to DOM range semantics (use only when testing pointer paths).
export async function dragDomSelectionBetweenNotes(remdo: RemdoTestApi, startNoteId: string, endNoteId: string) {
  const startElement = getNoteElementById(remdo, startNoteId);
  const endElement = getNoteElementById(remdo, endNoteId);
  const parent = startElement.parentElement;

  if (!parent || parent !== endElement.parentElement) {
    throw new Error('Expected note elements to share a list parent');
  }

  const siblings = Array.from(parent.childNodes);
  const startIndex = siblings.indexOf(startElement);
  const endIndex = siblings.indexOf(endElement);
  if (startIndex === -1 || endIndex === -1) {
    throw new Error('Expected note elements to be direct children of the list');
  }

  const startOffset = Math.min(startIndex, endIndex);
  const endOffset = Math.max(startIndex, endIndex) + 1;

  await mutateDomSelection((selection) => {
    const range = document.createRange();
    range.setStart(parent, startOffset);
    range.setEnd(parent, endOffset);
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

// Structural selection helper: single-note uses Shift+Arrow to climb to structural,
// multi-note uses a Lexical range selection to trigger structural snapping.
// Limitations: multi-note path requires text nodes in both notes and does not
// simulate DOM pointer selection; use selectStructuralNotesByDomRange for that path.
export async function selectStructuralNotesById(
  remdo: RemdoTestApi,
  startNoteId: string,
  endNoteId: string = startNoteId
): Promise<void> {
  if (startNoteId === endNoteId) {
    const noteText = readOutline(remdo).find((note) => note.noteId === startNoteId)?.text ?? '';
    const needsInlineStage = noteText.trim().length > 0;
    await placeCaretAtNoteId(remdo, startNoteId, 0);

    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    if (needsInlineStage) {
      await pressKey(remdo, { key: 'ArrowDown', shift: true });
    }
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: [startNoteId] });
    });
    return;
  }

  await selectRangeSelectionById(remdo, startNoteId, endNoteId);
  await waitFor(() => {
    expect(remdo.editor.selection.isStructural()).toBe(true);
  });
}

// DOM-range structural selection for pointer-driven paths only.
// Limitations: only works for sibling notes sharing a list parent and can include
// extra siblings in nested lists; assert the resulting selection explicitly.
export async function selectStructuralNotesByDomRange(
  remdo: RemdoTestApi,
  startNoteId: string,
  endNoteId: string = startNoteId
): Promise<void> {
  if (startNoteId === endNoteId) {
    await selectStructuralNotesById(remdo, startNoteId);
    return;
  }

  await dragDomSelectionBetweenNotes(remdo, startNoteId, endNoteId);
}

// DOM range selection that avoids Selection.extend (e.g. touch-handle drags).
// Limitations: does not produce Lexical selection events unless selectionchange is handled.
export async function dragDomSelectionBetweenRange(
  start: Node,
  startOffset: number,
  end: Node,
  endOffset: number
) {
  await mutateDomSelection(() => {
    const { startNode, startOffset: normalizedStart, endNode, endOffset: normalizedEnd } = orderRangePoints(
      start,
      clampDomOffset(start, startOffset),
      end,
      clampDomOffset(end, endOffset)
    );
    const range = document.createRange();
    range.setStart(startNode, normalizedStart);
    range.setEnd(endNode, normalizedEnd);
    const selection = getDomSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

// Collapse the DOM selection to a caret at a specific node/offset.
// Limitations: DOM-only; does not guarantee Lexical selection state without selectionchange.
export async function collapseDomSelectionAtNode(target: Node, offset: number) {
  await mutateDomSelection((selection) => {
    const caretRange = document.createRange();
    const clamped = clampDomOffset(target, offset);
    caretRange.setStart(target, clamped);
    caretRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caretRange);
  });
}

// Extend an existing DOM selection to a node/offset using Selection.extend.
export async function extendDomSelectionToNode(target: Node, offset: number) {
  await mutateDomSelection((selection) => {
    if (selection.rangeCount === 0) {
      throw new Error('Cannot extend selection without an existing anchor');
    }

    const clamped = clampDomOffset(target, offset);
    selection.extend(target, clamped);
  });
}

function clampOffset(node: Text, offset: number): number {
  const length = node.length;
  return Math.max(0, Math.min(offset, length));
}

function clampElementOffset(node: HTMLElement, offset: number): number {
  const length = node.childNodes.length;
  return Math.max(0, Math.min(offset, length));
}

function clampDomOffset(node: Node, offset: number): number {
  if (node instanceof Text) {
    return clampOffset(node, offset);
  }
  if (node instanceof HTMLElement) {
    return clampElementOffset(node, offset);
  }
  throw new TypeError('Expected text or element node for selection offsets');
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
