import { describe, expect, it } from 'vitest';
import { $getSelection, $isRangeSelection } from 'lexical';
import type { RangeSelection } from 'lexical';

import { getContiguousSelectionHeads } from '@/editor/outline/structural-selection';
import { getListItemLabel, placeCaretAtNote, selectNoteRange } from '#tests';

describe('structural selection helper', () => {
  it('returns heads and slab for mixed-depth selection spanning a sibling run', async ({ lexical }) => {
    await lexical.load('tree_complex');
    await selectNoteRange('note2', 'note4', lexical.mutate); // includes child note3 through note2

    const heads = lexical.validate(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      const result = getContiguousSelectionHeads(selection as RangeSelection);
      return result ? result.map(getListItemLabel) : null;
    });

    expect(heads).toEqual(['note2', 'note4']);
  });

  it('returns null for collapsed selections', async ({ lexical }) => {
    await lexical.load('tree_complex');
    await placeCaretAtNote('note2', lexical.mutate);

    const slice = lexical.validate(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      return getContiguousSelectionHeads(selection as RangeSelection);
    });

    expect(slice).toBeNull();
  });

  it('normalizes parent/child spans to the ancestor slab', async ({ lexical }) => {
    await lexical.load('tree_complex');
    await selectNoteRange('note1', 'note3', lexical.mutate); // crosses root note and nested child

    const heads = lexical.validate(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      const result = getContiguousSelectionHeads(selection as RangeSelection);
      return result ? result.map(getListItemLabel) : null;
    });

    expect(heads).toEqual(['note1']);
  });
});
