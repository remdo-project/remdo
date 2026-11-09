import { $getNoteByText, meta } from '#tests';
import { describe, expect, it } from 'vitest';
import { moveNotesDown } from '#client/editor/outline/note-ops';

describe('note ops', () => {
  it('returns false for non-contiguous move requests', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const moved = remdo.validate(() => {
      const note1 = $getNoteByText('note1');
      const note3 = $getNoteByText('note3');
      return moveNotesDown([note1, note3], null);
    });

    expect(moved).toBe(false);
  });
});
