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

  it('delete-wins when one peer removes a body while the other edits it', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);

    // Both peers see note1's body.
    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'shared');
    await remdo.waitForSynced();
    await waitFor(() => {
      expect(secondary).toMatchOutline([
        { noteId: 'note1', text: 'note1', body: 'shared' },
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ]);
    });

    // Secondary edits inside the body; primary removes the body. Deleting the
    // body-wrapper subtree wins over the concurrent edit into it (standard Yjs
    // delete-parent vs edit-child resolution) — the body is gone on both peers,
    // with no orphaned content and no divergence.
    await placeCaretAtNote(secondary, 'note1', 0);
    await pressKey(secondary, { key: 'Enter', shift: true });
    await typeText(secondary, 'more');

    await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'Delete' });

    const expected = [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ];
    await waitFor(() => {
      expect(remdo).toMatchOutline(expected);
      expect(secondary).toMatchOutline(expected);
    });
    expect(readOutline(secondary)).toEqual(readOutline(remdo));
  });
});
