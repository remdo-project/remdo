import { describe, expect, it } from 'vitest';
import { meta } from '#tests';
import { moveNotesDown } from '#client/editor/outline/note-ops';
import { $findNoteById } from '#client/editor/outline/note-traversal';

describe('note ops', () => {
  it('returns false for non-contiguous move requests', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const moved = remdo.validate(() => {
      const note1 = $findNoteById('note1')!;
      const note3 = $findNoteById('note3')!;
      return moveNotesDown([note1, note3], null);
    });

    expect(moved).toBe(false);
  });
});
