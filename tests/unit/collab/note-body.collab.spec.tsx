import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';

import { placeCaretAtNote, pressKey, readOutline, typeText, meta } from '#tests';
import { createCollabPeer } from './_support/remdo-peers';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('note body collaboration', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('a body added on one peer syncs to the other as note body content', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    expect(readOutline(secondary)).toEqual(readOutline(remdo));

    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'shared body');

    await waitFor(() => {
      expect(secondary).toMatchOutline([
        { noteId: 'note1', text: 'note1', body: 'shared body' },
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ]);
    });
  });
});
