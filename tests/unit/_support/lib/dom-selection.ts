import { act, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

import type { RemdoTestApi } from '@/editor/plugins/dev';
import { readOutline, placeCaretAtNoteId } from './note';
import { pressKey } from './keyboard';
import { getNoteElementById } from './dom-note';

// Low-level drag helper for precise text-node selection ranges.
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

// Note-level selection by list-item boundaries (no text-node offsets).
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

// DOM-driven selection that targets structural note selection(s) by list-item range.
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

  await dragDomSelectionBetweenNotes(remdo, startNoteId, endNoteId);
}

// Range-only selection for paths that don't use Selection.extend (e.g. touch-handle drags).
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
