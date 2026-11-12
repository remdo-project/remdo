import { $getNoteByText, meta } from '#tests';
import { act, waitFor } from '@testing-library/react';
import { $getState, $isTextNode, $setState } from 'lexical';
import { describe, expect, it, vi } from 'vitest';
import { CollabSession } from '#collaboration/session';

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
      const note2 = $getNoteByText('note2');
      $setState(note2, markerState, 'number:3');
      $setState(note2, checkboxState, true);
    });
    await remdo.waitForSynced();

    const expected = {
      note1: { marker: 'heading:2', checkbox: undefined },
      note2: { marker: 'number:3', checkbox: true },
    };
    const readNotes = (peer: RemdoTestApi) => ({ note1: readNote(peer, 'note1'), note2: readNote(peer, 'note2') });
    await waitFor(() => {
      expect(readNotes(secondary)).toEqual(expected);
    });

    const joined = await createCollabPeer(remdo);
    await waitFor(() => {
      expect(readNotes(joined)).toEqual(expected);
    });
  });

  it('keeps a marker change and typing made offline in the same note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const attach = vi.spyOn(CollabSession.prototype, 'attach');
    const secondary = await createCollabPeer(remdo);
    const session = (attach.mock.contexts as CollabSession[]).at(-1)!;
    const provider = session.getProvider()!;

    try {
      await act(async () => provider.disconnect());
      await waitFor(() => expect(session.snapshot().synced).toBe(false));
      await act(async () => {
        secondary.editor.update(
          () => {
            const text = $getNoteByText('note2').getFirstChild();
            if ($isTextNode(text)) {
              text.spliceText(text.getTextContentSize(), 0, ' typed');
            }
          },
          { discrete: true }
        );
      });
      await remdo.mutate(() => {
        $setState($getNoteByText('note2'), markerState, 'heading:1');
      });
      await remdo.waitForSynced();
    } finally {
      await act(async () => {
        await provider.connect();
        await session.awaitSynced();
      });
      attach.mockRestore();
    }

    await waitFor(() => {
      for (const peer of [remdo, secondary]) {
        expect(readNote(peer, 'note2 typed')).toEqual({ marker: 'heading:1', checkbox: undefined });
      }
    });
  });
});
