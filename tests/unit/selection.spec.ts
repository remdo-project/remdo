import { describe, expect, it } from 'vitest';
import type { TestContext } from 'vitest';
import { placeCaretAtNote, pressKey } from '#tests';
import { $getSelection, $isRangeSelection, $isTextNode, $getRoot } from 'lexical';
import type { LexicalNode } from 'lexical';
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

    const anchorNode = selection.anchor.getNode();
    const focusNode = selection.focus.getNode();

    if (!$isTextNode(anchorNode) || !$isTextNode(focusNode)) {
      throw new Error('Expected text nodes on both selection endpoints');
    }

    const seen = new Set<string>();
    const selectedNotes: string[] = [];
    for (const node of selection.getNodes()) {
      let current: LexicalNode | null = node;
      let noteText: string | null = null;
      while (current) {
        if ($isListItemNode(current)) {
          noteText = getListItemLabel(current);
          break;
        }
        current = current.getParent();
      }
      if (!noteText || seen.has(noteText)) {
        continue;
      }
      seen.add(noteText);
      selectedNotes.push(noteText);
    }

    if (selectedNotes.length === 0) {
      selectedNotes.push(...$collectAllNoteLabels());
    }

    return {
      selectedNotes: selectedNotes.sort(),
    } satisfies SelectionSnapshot;
  });
}

function expectSnapshotMatchesInlineOnly(snapshot: SelectionSnapshot, note: string) {
  expect(snapshot.selectedNotes).toEqual([note]);
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

function isChildrenWrapper(item: ListItemNode | null): boolean {
  if (!item) {
    return false;
  }
  const children = item.getChildren();
  return children.length === 1 && $isListNode(children[0] ?? null);
}

function $collectAllNoteLabels(): string[] {
  const root = $getRoot();
  const list = root.getFirstChild();
  if (!$isListNode(list)) {
    return [];
  }

  const labels: string[] = [];

  const traverseList = (target: LexicalNode | null) => {
    if (!$isListNode(target)) {
      return;
    }
    for (const child of target.getChildren()) {
      if (!$isListItemNode(child)) {
        continue;
      }
      const listItem = child as ListItemNode;
      if (isChildrenWrapper(listItem)) {
        const nested = listItem.getFirstChild();
        traverseList(nested ?? null);
        continue;
      }

      const label = getListItemLabel(listItem);
      if (label) {
        labels.push(label);
      }

      const wrapper = listItem.getNextSibling();
      if ($isListItemNode(wrapper) && isChildrenWrapper(wrapper)) {
        const nested = wrapper.getFirstChild();
        traverseList(nested ?? null);
      }
    }
  };

  traverseList(list);
  return labels;
}

describe('selection plugin', () => {
  it('snaps partial cross-note selections to whole notes', async ({ lexical }) => {
    lexical.load('flat');

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowLeft', shift: true });

    const snapshot = readSelectionSnapshot(lexical);

    expect(snapshot.selectedNotes).toEqual(['note1', 'note2']);
  });

  it('follows the Cmd/Ctrl+A progressive selection ladder', async ({ lexical }) => {
    lexical.load('tree_complex');

    await placeCaretAtNote('note2', lexical.mutate);

    // Stage 1: inline text only.
    await pressKey(lexical.editor, { key: 'a', ctrlOrMeta: true });
    let snapshot = readSelectionSnapshot(lexical);
    expectSnapshotMatchesInlineOnly(snapshot, 'note2');

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
