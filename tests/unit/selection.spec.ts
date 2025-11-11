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

function readSelectionSnapshot(lexical: TestContext['lexical']): SelectionSnapshot {
  return lexical.validate(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      throw new Error('Expected a range selection');
    }

    const labels = $collectLabelsFromSelection(selection);
    const finalLabels = labels.length > 0 ? labels : $collectAllNoteLabels();

    return {
      selectedNotes: finalLabels,
    } satisfies SelectionSnapshot;
  });
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

  it('lets Shift+Down walk the progressive selection ladder', async ({ lexical }) => {
    // TODO: Once Shift+ArrowDown supports stage-by-stage escalation (inline -> subtree -> siblings),
    // update this test to cover the finer-grained ladder.
    lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    let snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3']);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note2', 'note3', 'note4']);

    await pressKey(lexical.editor, { key: 'ArrowDown', shift: true });
    snapshot = readSelectionSnapshot(lexical);
    expect(snapshot.selectedNotes).toEqual(['note1', 'note2', 'note3', 'note4']);
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
