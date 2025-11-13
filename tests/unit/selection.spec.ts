import { describe, expect, it } from 'vitest';
import type { TestContext } from 'vitest';
import { placeCaretAtNote, pressKey } from '#tests';
import { $getSelection, $isRangeSelection, $getRoot } from 'lexical';
import type { LexicalNode, RangeSelection } from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { ListItemNode } from '@lexical/list';

interface SelectionSnapshot {
  selectedNotes: string[];
}

interface ListItemRange {
  start: number;
  end: number;
}

function readSelectionSnapshot(lexical: TestContext['lexical']): SelectionSnapshot {
  return lexical.validate(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      throw new Error('Expected a range selection');
    }

    $assertSelectionRespectsOutline(selection);

    const labels = $collectLabelsFromSelection(selection);
    const finalLabels = labels.length > 0 ? labels : $collectAllNoteLabels();

    return {
      selectedNotes: finalLabels,
    } satisfies SelectionSnapshot;
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
  const items: ListItemNode[] = [];
  visitListItems($getRoot().getFirstChild(), (item) => {
    if (item.isSelected(selection)) {
      items.push(item);
    }
  });
  return items;
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

  if (seen.size === 0) {
    const anchorItem = findNearestListItem(selection.anchor.getNode());
    const anchorLabel = anchorItem ? getListItemLabel(anchorItem) : null;
    if (anchorLabel) {
      seen.add(anchorLabel);
    }
  }

  return Array.from(seen).sort();
}

describe('selection plugin', () => {
  it('keeps Shift+Left/Right selections confined to inline content', async ({ lexical }) => {
    lexical.load('flat');

    await placeCaretAtNote('note2', lexical.mutate, 0);
    await pressKey(lexical.editor, { key: 'ArrowLeft', shift: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2']);

    await placeCaretAtNote('note2', lexical.mutate, Number.POSITIVE_INFINITY);
    await pressKey(lexical.editor, { key: 'ArrowRight', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2']);
  });

  it('treats Shift+Left/Right as no-ops once the selection spans whole notes', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);

    // Promote selection to stage 2: note + descendants.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3']);

    await pressKey(lexical.editor, { key: 'ArrowLeft', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3']);

    await pressKey(lexical.editor, { key: 'ArrowRight', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3']);
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
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3']);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3', 'note4']);
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
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3']);

    await pressKey(lexical.editor, { key: 'x' });
    expect(rootElement.dataset.structuralSelection).toBe('true');
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3']);

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
    expect(snapshot.selectedNotes).toEqual(['note4']);
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
    expect(snapshot.selectedNotes).toEqual(['note2']);
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
    expect(snapshot.selectedNotes).toEqual(['note2']);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'End' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note4']);
  });

  it.fails('collapses structural selection when pressing PageUp/PageDown', async ({ lexical }) => {
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
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3', 'note4']);

    await pressKey(lexical.editor, { key: 'PageDown' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note4']);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    expect(rootElement.dataset.structuralSelection).toBe('true');

    await pressKey(lexical.editor, { key: 'PageUp' });
    expect(rootElement.dataset.structuralSelection).toBeUndefined();
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2']);
  });

  it('lets Shift+Down walk the progressive selection ladder', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);

    // Stage 1: inline body only.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2']);

    // Stage 2: note + descendants.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3']);

    // Stage 3: siblings at the same depth.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3', 'note4']);

    // Stage 4: hoist to parent subtree.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4']);

    // Stage 5+: walk root-level siblings one at a time (per docs/selection.md).
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4', 'note5']);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7']);
  });

  it('escalates Shift+Down from a nested leaf until the document is selected', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note3', lexical.mutate);

    // Stage 1 (docs/selection.md): inline body only.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note3']);

    // Stage 2: note + descendants; note3 is a leaf so nothing new appears.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note3']);

    // Stage 3 would add siblings, but the ladder skips empty rungs per docs/selection.md and hoists to the parent subtree (Stage 4).
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3']);

    // Stage 5: include the parent's next sibling (note4) while keeping the range contiguous.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3', 'note4']);

    // Stage 6: hoist to the next ancestor (note1) and capture its subtree.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4']);

    // Stage 7+: walk root-level siblings one at a time, per docs/selection.md.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4', 'note5']);

    // Selecting note6 (a parent) must automatically bring along its child note7.
    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7']);
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

      const first = snapshot.selectedNotes[0];
      const last = snapshot.selectedNotes[snapshot.selectedNotes.length - 1];
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

  it('skips the sibling stage when Shift+Down reaches a siblingless note', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note7', lexical.mutate);

    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note7']);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note7']);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note7']);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note6', 'note7']);
  });

  it('lets Shift+Up walk the progressive selection ladder', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note4', lexical.mutate, 2);

    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note4']);

    // Stage 1: inline body only.
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note4']);

    // Stage 2: note + descendants (note4 has no children, so the range is unchanged).
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note4']);

    // Stage 3: include the nearest preceding sibling at this depth.
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3', 'note4']);

    // Stage 4: hoist to the parent subtree.
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4']);

    // Stage 5+: walk root-level siblings upward one at a time, then finish the ladder.
    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4', 'note5']);

    await pressKey(lexical.editor, { key: 'ArrowUp', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7']);
  });

  it('follows the Cmd/Ctrl+A progressive selection ladder', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);

    // Stage 1: inline text only.
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2']);

    // Stage 2: note body plus its descendants.
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3']);

    // Stage 3 adds the active note's siblings (and their descendants).
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3', 'note4']);

    // Stage 4 hoists the selection to the parent note and its subtree.
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4']);

    // Stage 5 selects every ancestor level until the root.
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7']);

    // Moving the caret resets the ladder back to stage 1.
    await placeCaretAtNote('note4', lexical.mutate);
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note4']);
  });

  it('skips the sibling stage when Cmd/Ctrl+A climbs from a siblingless note', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note7', lexical.mutate);

    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note7']);

    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note7']);

    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);

    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note6', 'note7']);
  });

  it('keeps the progressive ladder in sync when mixing Shift+Arrow and Cmd/Ctrl+A', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2']);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3']);

    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3', 'note4']);

    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4']);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4', 'note5']);
  });
});

describe('readSelectionSnapshot helper', () => {
  it('reports every note when the root is selected', async ({ lexical }) => {
    lexical.load('tree_complex');

    await lexical.mutate(() => {
      $getRoot().select(0, $getRoot().getChildrenSize());
    });

    const snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7']);
  });
});
