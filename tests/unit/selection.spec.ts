import { describe, expect, it } from 'vitest';
import type { TestContext } from 'vitest';
import { placeCaretAtNote, pressKey } from '#tests';
import { $getSelection, $isRangeSelection, $isTextNode } from 'lexical';
import type { LexicalNode } from 'lexical';
import { $isListItemNode } from '@lexical/list';

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
          noteText = current.getTextContent().trim();
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

    return {
      selectedNotes: selectedNotes.sort(),
    } satisfies SelectionSnapshot;
  });
}

describe('selection plugin', () => {
  it('snaps partial cross-note selections to whole notes', async ({ lexical }) => {
    lexical.load('flat');

    await placeCaretAtNote('note2', lexical.mutate);
    await pressKey(lexical.editor, { key: 'ArrowLeft', shift: true });

    const snapshot = readSelectionSnapshot(lexical);

    expect(snapshot.selectedNotes).toEqual(['note1', 'note2']);
  });

  it.todo('implements the progressive selection ladder stages');
});
