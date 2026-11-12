import { $getNoteByText, meta, placeCaretAtNote, typeText } from '#tests';
import { waitFor } from '@testing-library/react';
import { $getState, $setState } from 'lexical';
import { describe, expect, it } from 'vitest';

import type { RemdoTestApi } from '#client/editor/dev';
import { checkboxState, markerState } from '#client/editor/features/list-types/note-marker';
import { createCollabPeer } from './_support/remdo-peers';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

const readNote = (remdo: RemdoTestApi, text: string) =>
  remdo.validate(() => {
    const note = $getNoteByText(text);
    return { marker: $getState(note, markerState), checkbox: $getState(note, checkboxState) };
  });

describe('collaboration note markers', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('syncs markers and checkboxes to peers and to a peer that joins later', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);

    await remdo.mutate(() => {
      $setState($getNoteByText('note1'), markerState, 'heading:2');
      $setState($getNoteByText('note2'), markerState, 'number:3');
      $setState($getNoteByText('note2'), checkboxState, true);
    });
    await remdo.waitForSynced();

    const expected = { marker: 'number:3', checkbox: true };
    await waitFor(() => {
      expect(readNote(secondary, 'note1')).toEqual({ marker: 'heading:2', checkbox: undefined });
      expect(readNote(secondary, 'note2')).toEqual(expected);
    });

    const joined = await createCollabPeer(remdo);
    await joined.waitForSynced();
    expect(readNote(joined, 'note1')).toEqual({ marker: 'heading:2', checkbox: undefined });
    expect(readNote(joined, 'note2')).toEqual(expected);
  });

  it('keeps a marker change and concurrent typing in the same note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const secondary = await createCollabPeer(remdo);
    await placeCaretAtNote(secondary, 'note2', Number.POSITIVE_INFINITY);

    await Promise.all([
      remdo.mutate(() => {
        $setState($getNoteByText('note2'), markerState, 'heading:1');
      }),
      typeText(secondary, ' typed'),
    ]);
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    await waitFor(() => {
      for (const peer of [remdo, secondary]) {
        expect(readNote(peer, 'note2 typed')).toEqual({ marker: 'heading:1', checkbox: undefined });
      }
    });
  });
});
