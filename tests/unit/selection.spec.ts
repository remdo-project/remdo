import { act, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TestContext } from 'vitest';
import { placeCaretAtNote, pressKey } from '#tests';
import { $getSelection, $isRangeSelection, $getRoot, $getNodeByKey } from 'lexical';
import type { LexicalNode, RangeSelection } from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { ListItemNode } from '@lexical/list';

type SelectionSnapshot =
  | { state: 'none' }
  | { state: 'caret'; note: string }
  | { state: 'inline'; note: string }
  | { state: 'structural'; notes: string[] };

interface ListItemRange {
  start: number;
  end: number;
}

function readSelectionSnapshot(lexical: TestContext['lexical']): SelectionSnapshot {
  const rootElement = lexical.editor.getRootElement();
  return lexical.validate(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return { state: 'none' };
    }

    $assertSelectionRespectsOutline(selection);

    if (selection.isCollapsed()) {
      const caretNote = $getCaretNoteLabel(selection);
      return caretNote ? ({ state: 'caret', note: caretNote } satisfies SelectionSnapshot) : { state: 'none' };
    }

    const structuralNotes = $collectLabelsFromSelection(selection);
    if (structuralNotes.length > 0) {
      return { state: 'structural', notes: structuralNotes } satisfies SelectionSnapshot;
    }

    const datasetNotes = rootElement?.dataset.structuralSelectionKeys
      ?.split(',')
      .filter(Boolean)
      .map((key) => {
        const node = $getNodeByKey<ListItemNode>(key);
        if (!node || !node.isAttached()) {
          return null;
        }
        return getListItemLabel(resolveContentListItem(node));
      })
      .filter((label): label is string => Boolean(label));

    if (datasetNotes?.length) {
      return { state: 'structural', notes: datasetNotes } satisfies SelectionSnapshot;
    }

    const inlineNote = $getCaretNoteLabel(selection);
    return inlineNote ? ({ state: 'inline', note: inlineNote } satisfies SelectionSnapshot) : { state: 'none' };
  });
}

// Ensures every multi-note selection matches the guarantees from docs/selection.md:
// once a selection crosses a note boundary it must cover a contiguous block of
// whole notes plus their subtrees, with no gaps or orphaned descendants.
function $assertSelectionRespectsOutline(selection: RangeSelection) {
  const selectedItems = $collectSelectedListItems(selection);
  if (selectedItems.length <= 1) {
    return;
  }

  const { orderedItems, rangeByKey } = $collectListItemOrderMetadata();
  if (orderedItems.length === 0) {
    return;
  }

  const selectedKeys = new Set(selectedItems.map((item) => item.getKey()));
  let minIndex = Number.POSITIVE_INFINITY;
  let maxIndex = Number.NEGATIVE_INFINITY;

  for (const item of selectedItems) {
    const range = rangeByKey.get(item.getKey());
    if (!range) {
      continue;
    }
    if (range.start < minIndex) {
      minIndex = range.start;
    }
    if (range.end > maxIndex) {
      maxIndex = range.end;
    }
  }

  if (!Number.isFinite(minIndex) || !Number.isFinite(maxIndex)) {
    return;
  }

  for (let index = minIndex; index <= maxIndex; index += 1) {
    const item = orderedItems[index];
    if (!item) {
      continue;
    }
    if (!selectedKeys.has(item.getKey())) {
      throw new Error('Selection must cover a contiguous block of notes and subtrees');
    }
  }
}

function $collectSelectedListItems(selection: RangeSelection): ListItemNode[] {
  const seen = new Set<string>();
  const items: ListItemNode[] = [];

  for (const node of selection.getNodes()) {
    const listItem = findNearestListItem(node);
    if (!listItem || !listItem.isAttached()) {
      continue;
    }

    const contentItem = resolveContentListItem(listItem);
    const key = contentItem.getKey();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(contentItem);
  }

  if (items.length === 0) {
    return items;
  }

  return items.sort(compareDocumentOrder);
}

function $collectListItemOrderMetadata(): {
  orderedItems: ListItemNode[];
  rangeByKey: Map<string, ListItemRange>;
} {
  const orderedItems: ListItemNode[] = [];
  const rangeByKey = new Map<string, ListItemRange>();

  const visit = (node: LexicalNode | null) => {
    if (!$isListNode(node)) {
      return;
    }

    for (const child of node.getChildren()) {
      if (!$isListItemNode(child)) {
        continue;
      }

      const contentItem = resolveContentListItem(child);
      const start = orderedItems.length;
      orderedItems.push(contentItem);

      const nestedList = getNestedList(contentItem);
      if (nestedList) {
        visit(nestedList);
      }

      const end = orderedItems.length - 1;
      rangeByKey.set(contentItem.getKey(), { start, end });
    }
  };

  visit($getRoot().getFirstChild());
  return { orderedItems, rangeByKey };
}


function getListItemLabel(item: ListItemNode): string | null {
  const contentItem = resolveContentListItem(item);
  const pieces: string[] = [];
  for (const child of contentItem.getChildren()) {
    if (typeof child.getType === 'function' && child.getType() === 'list') {
      continue;
    }

    const getTextContent = (child as { getTextContent?: () => string }).getTextContent;
    if (typeof getTextContent === 'function') {
      pieces.push(getTextContent.call(child));
    }
  }

  const label = pieces.join('').trim();
  if (label.length > 0) {
    return label;
  }

  return contentItem === item ? null : getListItemLabel(contentItem);
}

function resolveContentListItem(item: ListItemNode): ListItemNode {
  if (!isChildrenWrapper(item)) {
    return item;
  }

  const previous = item.getPreviousSibling();
  return $isListItemNode(previous) ? previous : item;
}

function compareDocumentOrder(a: ListItemNode, b: ListItemNode): number {
  return a === b ? 0 : a.isBefore(b) ? -1 : b.isBefore(a) ? 1 : 0;
}

function isChildrenWrapper(node: LexicalNode | null): node is ListItemNode {
  if (!$isListItemNode(node)) {
    return false;
  }
  const children = node.getChildren();
  return children.length === 1 && $isListNode(children[0] ?? null);
}

function $collectAllNoteLabels(): string[] {
  const root = $getRoot();
  const list = root.getFirstChild();
  if (!$isListNode(list)) {
    return [];
  }

  const labels: string[] = [];
  visitListItems(list, (item) => {
    const label = getListItemLabel(item);
    if (label) {
      labels.push(label);
    }
  });
  return labels;
}

function visitListItems(node: LexicalNode | null, visit: (item: ListItemNode) => void) {
  if (!$isListNode(node)) {
    return;
  }

  for (const child of node.getChildren()) {
    if (!$isListItemNode(child)) {
      continue;
    }

    const contentItem = resolveContentListItem(child);
    visit(contentItem);

    const nestedList = getNestedList(contentItem);
    if (nestedList) {
      visitListItems(nestedList, visit);
    }
  }
}

function $readVisualRangeLabels(selection: RangeSelection) {
  const items = $collectSelectedListItems(selection);
  if (items.length === 0) {
    throw new Error('Expected structural selection');
  }

  const startLabel = getListItemLabel(items[0]!);
  const endLabel = getListItemLabel(items[items.length - 1]!);
  if (!startLabel || !endLabel) {
    throw new Error('Expected structural selection labels');
  }

  return { visualStart: startLabel, visualEnd: endLabel } as const;
}

function getNestedList(item: ListItemNode): LexicalNode | null {
  const wrapper = item.getNextSibling();
  if (isChildrenWrapper(wrapper)) {
    const nested = wrapper.getFirstChild();
    return $isListNode(nested) ? nested : null;
  }

  for (const child of item.getChildren()) {
    if ($isListNode(child)) {
      return child;
    }
  }

  return null;
}


function findNearestListItem(node: LexicalNode | null): ListItemNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isListItemNode(current)) {
      return resolveContentListItem(current);
    }
    current = current.getParent();
  }
  return null;
}

function $collectLabelsFromSelection(selection: RangeSelection): string[] {
  const seen = new Set<string>();
  visitListItems($getRoot().getFirstChild(), (item) => {
    if (!item.isSelected(selection)) {
      return;
    }
    const label = getListItemLabel(item);
    if (label) {
      seen.add(label);
    }
  });

  return Array.from(seen).sort();
}

function $getCaretNoteLabel(selection: RangeSelection): string | null {
  const resolveLabel = (point: RangeSelection['anchor']): string | null => {
    const item = findNearestListItem(point.getNode());
    if (!item || !item.isAttached()) {
      return null;
    }
    return getListItemLabel(item);
  };

  return resolveLabel(selection.focus) ?? resolveLabel(selection.anchor);
}

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
    if (typeof selection.extend === 'function') {
      selection.extend(target, clamped);
    } else {
      const range = selection.getRangeAt(0);
      const ordered = orderRangePoints(range.startContainer, range.startOffset, target, clamped);
      const fallbackRange = document.createRange();
      fallbackRange.setStart(ordered.startNode, ordered.startOffset);
      fallbackRange.setEnd(ordered.endNode, ordered.endOffset);
      selection.removeAllRanges();
      selection.addRange(fallbackRange);
    }
  });
}

function getNoteTextNode(rootElement: HTMLElement, label: string): Text {
  const noteElement = within(rootElement).getByText((_, node) => node?.textContent?.trim() === label, {
    selector: '[data-lexical-text="true"]',
  });
  const textNode = findFirstTextNode(noteElement);
  if (!textNode) {
    throw new Error(`Expected text node for note: ${label}`);
  }
  return textNode;
}

function findFirstTextNode(element: Element | null): Text | null {
  if (!element) {
    return null;
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  return node instanceof Text ? node : null;
}

function getTextLength(node: Text): number {
  return node.textContent?.length ?? 0;
}

function clampOffset(node: Text, offset: number): number {
  const length = getTextLength(node);
  return Math.max(0, Math.min(offset, length));
}

function getDomSelection(): Selection {
  const selection = window.getSelection();
  if (!selection) {
    throw new Error('DOM selection is unavailable');
  }
  return selection;
}

async function mutateDomSelection(mutator: (selection: Selection) => void) {
  await act(async () => {
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
  it('snaps pointer drags across note boundaries to contiguous structural slices', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    const note2Text = getNoteTextNode(rootElement, 'note2');
    const note5Text = getNoteTextNode(rootElement, 'note5');
    await dragDomSelectionBetween(note2Text, 1, note5Text, 1);

    await waitFor(() => {
      expect(readSelectionSnapshot(lexical)).toEqual({
        state: 'structural',
        notes: ['note2', 'note3', 'note4', 'note5'],
      });
    });

    const note6Text = getNoteTextNode(rootElement, 'note6');
    const note7Text = getNoteTextNode(rootElement, 'note7');
    await dragDomSelectionBetween(note6Text, 0, note7Text, getTextLength(note7Text));

    await waitFor(() => {
      expect(readSelectionSnapshot(lexical)).toEqual({
        state: 'structural',
        notes: ['note6', 'note7'],
      });
    });
  });

  it('extends pointer selections with Shift+Click to produce contiguous note ranges', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    const note2Text = getNoteTextNode(rootElement, 'note2');
    const note5Text = getNoteTextNode(rootElement, 'note5');
    await collapseDomSelectionAtText(note2Text, 0);

    await waitFor(() => {
      expect(readSelectionSnapshot(lexical)).toEqual({ state: 'caret', note: 'note2' });
    });

    await extendDomSelectionToText(note5Text, getTextLength(note5Text));

    await waitFor(() => {
      expect(readSelectionSnapshot(lexical)).toEqual({
        state: 'structural',
        notes: ['note2', 'note3', 'note4', 'note5'],
      });
    });

    await collapseDomSelectionAtText(note5Text, getTextLength(note5Text));

    await waitFor(() => {
      expect(readSelectionSnapshot(lexical)).toEqual({ state: 'caret', note: 'note5' });
    });

    const note3Text = getNoteTextNode(rootElement, 'note3');
    await extendDomSelectionToText(note3Text, getTextLength(note3Text));

    await waitFor(() => {
      expect(readSelectionSnapshot(lexical)).toEqual({
        state: 'structural',
        notes: ['note2', 'note3', 'note4', 'note5'],
      });
    });
  });

  it('keeps Shift+Left/Right selections confined to inline content', async ({ lexical }) => {
    lexical.load('flat');

    await placeCaretAtNote('note2', lexical.mutate, 0);
    await pressKey(lexical.editor, { key: 'ArrowLeft', shift: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'caret', note: 'note2' });

    await placeCaretAtNote('note2', lexical.mutate, Number.POSITIVE_INFINITY);
    await pressKey(lexical.editor, { key: 'ArrowRight', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'caret', note: 'note2' });
  });

  it('treats Shift+Left/Right as no-ops once the selection spans whole notes', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);

    // Promote selection to stage 2: note + descendants.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(lexical.editor, { key: 'ArrowLeft', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(lexical.editor, { key: 'ArrowRight', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('toggles the structural selection dataset when escalating the ladder', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note2', lexical.mutate);
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await placeCaretAtNote('note1', lexical.mutate);
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
  });

  it('collapses structural selection back to the caret when pressing Escape', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'Escape' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');
  });

  it('treats Enter as a no-op once structural selection is active', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'Enter' });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  });

  it('treats typing as a no-op once structural selection is active', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    const labelsBefore = lexical.validate(() => $collectAllNoteLabels());
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3'] });

    const stateBefore = lexical.editor.getEditorState();

    await pressKey(lexical.editor, { key: 'x' });
    expect(rootElement.dataset.structuralSelection).toBe('true');
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3'] });

    const stateAfter = lexical.editor.getEditorState();
    expect(stateAfter.toJSON()).toEqual(stateBefore.toJSON());

    const labelsAfter = lexical.validate(() => $collectAllNoteLabels());
    expect(labelsAfter).toEqual(labelsBefore);
  });

  it('clears the structural highlight when navigating without modifiers', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'ArrowRight' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
  });

  it('restores a single-note caret when navigating with plain arrows from structural mode', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'ArrowDown' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    const snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'caret', note: 'note4' });
  });

  it('places the caret at the leading edge when pressing ArrowLeft in structural mode', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note5', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'ArrowLeft' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await lexical.validate(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        throw new Error('Expected range selection');
      }
      const anchorItem = findNearestListItem(selection.anchor.getNode());
      const label = anchorItem ? getListItemLabel(anchorItem) : null;
      expect(label).toBe('note5');
    });
  });

  it('places the caret at the trailing edge when pressing ArrowRight in structural mode', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note5', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'ArrowRight' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    await lexical.validate(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        throw new Error('Expected range selection');
      }
      const anchorItem = findNearestListItem(selection.anchor.getNode());
      const label = anchorItem ? getListItemLabel(anchorItem) : null;
      expect(label).toBe('note6');
    });
  });

  it('places the caret at the top edge when pressing ArrowUp in structural mode', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'ArrowUp' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    const snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'caret', note: 'note2' });
  });

  it('lets Home/End collapse structural selections to their respective edges', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'Home' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'caret', note: 'note2' });

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'End' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'caret', note: 'note4' });
  });

  it('collapses structural selection when pressing PageUp/PageDown', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    await pressKey(lexical.editor, { key: 'PageDown' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'caret', note: 'note4' });

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'PageUp' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'caret', note: 'note2' });
  });

  it('lets Shift+Down walk the progressive selection ladder', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);

    // Stage 1: inline body only.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'inline', note: 'note2' });

    // Stage 2: note + descendants.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 3: siblings at the same depth.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 4: hoist to parent subtree.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Stage 5+: walk root-level siblings one at a time (per docs/selection.md).
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5'] });

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'] });
  });

  it('escalates Shift+Down from a nested leaf until the document is selected', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note3', lexical.mutate);

    // Stage 1 (docs/selection.md): inline body only.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'inline', note: 'note3' });

    // Stage 2 promotes the nested leaf structurally.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note3'] });

    // Stage 3 would add siblings, but the ladder skips empty rungs per docs/selection.md and hoists to the parent subtree (Stage 4).
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 5: include the parent's next sibling (note4) while keeping the range contiguous.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 6: hoist to the next ancestor (note1) and capture its subtree.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Stage 7+: walk root-level siblings one at a time, per docs/selection.md.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5'] });

    // Selecting note6 (a parent) must automatically bring along its child note7.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'] });
  });

  it('keeps the structural highlight aligned with the selected notes', async ({ lexical }) => {
    // TODO: simplify this regression while preserving the coverage described above.
    lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);

    const assertVisualEnvelopeMatchesSelection = async () => {
      const snapshot = readSelectionSnapshot(lexical);
      const labels = lexical.validate(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          throw new Error('Expected a range selection');
        }
        return $readVisualRangeLabels(selection);
      });

      if (snapshot.state !== 'structural') {
        throw new Error('Expected structural snapshot');
      }
      const first = snapshot.notes[0];
      const last = snapshot.notes[snapshot.notes.length - 1];
      expect(labels.visualStart).toBe(first);
      expect(labels.visualEnd).toBe(last);
    };

    // Stage 2: note2 + descendants.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await assertVisualEnvelopeMatchesSelection();

    // Stage 4: parent subtree (note1..note4).
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await assertVisualEnvelopeMatchesSelection();
  });

  it('marks structural selection once Shift+Down reaches stage 2 even for leaf notes', async ({ lexical }) => {
    lexical.load('tree_complex');

    const rootElement = lexical.editor.getRootElement();
    if (!rootElement) {
      throw new Error('Expected editor root element');
    }

    await placeCaretAtNote('note4', lexical.mutate);
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    // Stage 1 should stay unstructured.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();

    // Stage 2 should flip the structural dataset for leaf notes so the UI highlights the block.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');
  });

  it('selects nested leaves structurally at Shift+Down stage 2', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note3', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });

    const snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note3'] });
  });

  it('skips the sibling stage when Shift+Down reaches a siblingless note', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note7', lexical.mutate);

    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'caret', note: 'note7' });

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'inline', note: 'note7' });

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note7'] });
  });

  it('lets Shift+Up walk the progressive selection ladder', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note4', lexical.mutate, 2);

    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'caret', note: 'note4' });

    // Stage 1: inline body only.
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'inline', note: 'note4' });

    // Stage 2: grab the leaf structurally.
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note4'] });

    // Stage 3: include the nearest preceding sibling at this depth.
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 4: hoist to the parent subtree.
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Stage 5+: walk root-level siblings upward one at a time, then finish the ladder.
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5'] });

    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'] });
  });

  it('selects leaf notes structurally at Shift+Up stage 2', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note4', lexical.mutate, 2);
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });

    const snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note4'] });
  });

  it('follows the Cmd/Ctrl+A progressive selection ladder', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);

    // Stage 1: inline text only.
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'inline', note: 'note2' });

    // Stage 2: note body plus its descendants.
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3'] });

    // Stage 3 adds the active note's siblings (and their descendants).
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    // Stage 4 hoists the selection to the parent note and its subtree.
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    // Stage 5 selects every ancestor level until the root.
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'] });

    // Moving the caret resets the ladder back to stage 1.
    await placeCaretAtNote('note4', lexical.mutate);
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'inline', note: 'note4' });
  });

  it('skips the sibling stage when Cmd/Ctrl+A climbs from a siblingless note', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note7', lexical.mutate);

    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'caret', note: 'note7' });

    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'inline', note: 'note7' });

    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);

    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note6', 'note7'] });
  });

  it('keeps the progressive ladder in sync when mixing Shift+Arrow and Cmd/Ctrl+A', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'inline', note: 'note2' });

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3'] });

    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4'] });

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5'] });
  });
});

describe('readSelectionSnapshot helper', () => {
  it('reports every note when the root is selected', async ({ lexical }) => {
    lexical.load('tree_complex');

    await lexical.mutate(() => {
      $getRoot().select(0, $getRoot().getChildrenSize());
    });

    const snapshot = readSelectionSnapshot(lexical);
    expect(snapshot).toEqual({ state: 'structural', notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'] });
  });
});
