import { describe, expect, it } from 'vitest';
import { meta, placeCaretAtNote, selectNoteRange } from '#tests';
import { $getSelection, $isRangeSelection } from 'lexical';
import { moveNotesDown, resolveRangeSelectionHeads } from '@/editor/outline/note-ops';
import { $findNoteById } from '@/editor/outline/note-traversal';

describe('note ops', () => {
  it('resolves collapsed caret selection to one root note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');

    const resolvedIds = remdo.validate(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return [];
      }

      return resolveRangeSelectionHeads(selection).map((item) => item.getKey());
    });

    const expected = remdo.validate(() => $findNoteById('note2')!.getKey());
    expect(resolvedIds).toEqual([expected]);
  });

  it('resolves multi-note structural range to contiguous sibling heads', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note2', 'note3');

    const resolved = remdo.validate(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return [];
      }

      return resolveRangeSelectionHeads(selection).map((item) => item.getKey());
    });

    const expected = remdo.validate(() => [$findNoteById('note2')!.getKey(), $findNoteById('note3')!.getKey()]);
    expect(resolved).toEqual(expected);
  });

  it('returns false for non-contiguous move requests', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const moved = remdo.validate(() => {
      const note1 = $findNoteById('note1')!;
      const note3 = $findNoteById('note3')!;
      return moveNotesDown([note1, note3], null);
    });

    expect(moved).toBe(false);
  });
});
