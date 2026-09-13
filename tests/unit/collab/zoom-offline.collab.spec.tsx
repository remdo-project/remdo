import { act, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CollabSession } from '#collaboration/session';
import { createDocumentPath } from '#document-routes';
import { getNoteElement, resetTestUserData } from '#tests';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { renderZoomNavigation } from '../_support/zoom-navigation-harness';

vi.mock('#client/app/user-data/user-data', async () => {
  const { mockUserDataModule } = await import('#tests');
  return mockUserDataModule();
});

beforeEach(resetTestUserData);

it('leaves zoom when its resolved root is deleted while disconnected', async () => {
  const attach = vi.spyOn(CollabSession.prototype, 'attach');
  const { api, docId, router } = await renderZoomNavigation('note7');
  const session = (attach.mock.contexts as CollabSession[]).find((candidate) => candidate.snapshot().docId === docId)!;
  const provider = session.getProvider()!;
  await waitFor(() => expect(getNoteElement(api, 'note7')).toHaveAttribute('data-zoom-root', 'true'));

  try {
    await act(async () => provider.disconnect());
    await waitFor(() => expect(session.snapshot().synced).toBe(false));

    await act(async () => {
      api.editor.update(() => $findNoteById('note7')!.remove(), { discrete: true });
    });

    await waitFor(() => expect(router.state.location.pathname).toBe(createDocumentPath(docId)));
    expect(session.snapshot().synced).toBe(false);
  } finally {
    await act(async () => {
      await provider.connect();
      await session.awaitSynced();
    });
  }
});
