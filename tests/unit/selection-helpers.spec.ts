import { describe, expect, it } from 'vitest';
import { $getSelection, $isRangeSelection } from 'lexical';
import type { RangeSelection } from 'lexical';

import { getContiguousSelectionHeads } from '@/editor/outline/selection/heads';
import { $getNoteIdOrThrow, placeCaretAtNoteId, selectNoteRangeById } from '#tests';

describe('structural selection helper', () => {
  it('returns heads and slab for mixed-depth selection spanning a sibling run', async ({ remdo }) => {
    await remdo.load('tree-complex');
    await selectNoteRangeById(remdo, 'note2', 'note4'); // includes child note3 through note2

    const heads = remdo.validate(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      const result = getContiguousSelectionHeads(selection as RangeSelection);
      return result.map((item) => $getNoteIdOrThrow(item));
    });

    expect(heads).toEqual(['note2', 'note4']);
  });

  it('returns empty array for collapsed selections', async ({ remdo }) => {
    await remdo.load('tree-complex');
    await placeCaretAtNoteId(remdo, 'note1');

    const slice = remdo.validate(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      return getContiguousSelectionHeads(selection as RangeSelection);
    });

    expect(slice).toEqual([]);
  });

  it('normalizes parent/child spans to the ancestor slab', async ({ remdo }) => {
    await remdo.load('tree-complex');
    await selectNoteRangeById(remdo, 'note1', 'note3'); // crosses root note and nested child

    const heads = remdo.validate(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      const result = getContiguousSelectionHeads(selection as RangeSelection);
      return result.map((item) => $getNoteIdOrThrow(item));
    });

    expect(heads).toEqual(['note1']);
  });
});
