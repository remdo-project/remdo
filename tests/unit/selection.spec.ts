import { describe, expect, it } from 'vitest';
import { $getSelection, $isNodeSelection, $isRangeSelection } from 'lexical';
import type { LexicalNode } from 'lexical';
import { $isListItemNode } from '@lexical/list';
import {
  selectEntireNote,
  selectNoteRange,
} from '#tests';

function getNodePath(node: LexicalNode): number[] {
  const path: number[] = [];
  let current: LexicalNode | null = node;

  while (current) {
    const parent: LexicalNode | null = current.getParent();
    if (!parent) {
      break;
    }
    path.push(current.getIndexWithinParent());
    current = parent;
  }

  return path.reverse();
}

function sortNodesByDocumentOrder(nodes: LexicalNode[]): LexicalNode[] {
  return [...nodes].sort((a, b) => {
    const left = getNodePath(a);
    const right = getNodePath(b);
    const depth = Math.max(left.length, right.length);

    for (let i = 0; i < depth; i++) {
      const l = left[i] ?? -1;
      const r = right[i] ?? -1;
      if (l !== r) {
        return l - r;
      }
    }

    return 0;
  });
}

function getSelectionSummary(lexical: any) {
  return lexical.validate(() => {
    const selection = $getSelection();
    const summary = {
      isRange: $isRangeSelection(selection),
      isNode: $isNodeSelection(selection),
      noteTexts: [] as string[],
    };

    if ($isNodeSelection(selection)) {
      const nodes = sortNodesByDocumentOrder(selection.getNodes());
      for (const node of nodes) {
        if (!$isListItemNode(node)) {
          continue;
        }
        const text = node
          .getChildren()
          .filter((child) => typeof child.getTextContent === 'function' && child.getType() !== 'list')
          .map((child) => child.getTextContent().trim())
          .join('')
          .trim();
        if (text) {
          summary.noteTexts.push(text);
        }
      }
    }

    return summary;
  });
}

describe('note selection plugin', () => {
  it('keeps inline selections within a single note as range selections', async ({ lexical }) => {
    lexical.load('flat');

    await selectEntireNote('note1', lexical.mutate);

    const summary = getSelectionSummary(lexical);

    expect(summary.isRange).toBe(true);
    expect(summary.isNode).toBe(false);
  });

  it('promotes cross-note ranges into node selections for sibling notes', async ({ lexical }) => {
    lexical.load('flat');

    await selectNoteRange('note1', 'note2', lexical.mutate);

    const summary = getSelectionSummary(lexical);

    expect(summary.isNode).toBe(true);
    expect(summary.noteTexts).toEqual(['note1', 'note2']);
  });

  it('captures the entire subtree when selecting from a parent into its child', async ({ lexical }) => {
    lexical.load('tree_complex');

    await selectNoteRange('note2', 'note3', lexical.mutate);

    const summary = getSelectionSummary(lexical);

    expect(summary.isNode).toBe(true);
    expect(summary.noteTexts).toEqual(['note2', 'note3']);
  });

  it('includes descendants and siblings when the selection spans them', async ({ lexical }) => {
    lexical.load('tree_complex');

    await selectNoteRange('note2', 'note5', lexical.mutate);

    const summary = getSelectionSummary(lexical);

    expect(summary.isNode).toBe(true);
    expect(summary.noteTexts).toEqual(['note2', 'note3', 'note4', 'note5']);
  });
});
