import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentPath } from '#document-routes';
import { ZOOM_OUT_COMMAND, ZOOM_TO_NOTE_COMMAND } from '#client/editor/foundation/commands';
import { readCaretNoteId, resetTestUserData } from '#tests';
import { renderZoomNavigation } from '../../../../tests/unit/_support/zoom-navigation-harness';

vi.mock('#client/app/user-data/user-data', async () => {
  const { mockUserDataModule } = await import('#tests');
  return mockUserDataModule();
});

describe('zoom navigation with pending routes', () => {
  beforeEach(resetTestUserData);

  it('keeps Home and its focus when an older root navigation completes', async () => {
    const { api, router, holdRoute } = await renderZoomNavigation();
    const release = holdRoute(null);
    try {
      await act(async () => {
        api.editor.dispatchCommand(ZOOM_OUT_COMMAND, undefined);
      });
      expect(router.state.navigation.state).toBe('loading');
      await act(async () => {
        api.editor.dispatchCommand(ZOOM_OUT_COMMAND, undefined);
      });
      expect(screen.getByRole('heading', { name: 'Home' })).toHaveFocus();

      await act(async () => release());
      await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
      expect(router.state.location.pathname).toBe('/');
      expect(screen.getByRole('heading', { name: 'Home' })).toHaveFocus();

    } finally {
      release();
    }
  });

  it.each(['command', 'route'] as const)(
    'returns to the last accepted branch via %s before zoom-in routing finishes',
    async (navigation) => {
      const { api, docId, router, holdRoute } = await renderZoomNavigation(navigation === 'route' ? null : 'note1');
      const release = holdRoute('note4');
      try {
        await act(async () => {
          api.editor.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId: 'note4' });
        });
        expect(router.state.navigation.state).toBe('loading');
        expect(readCaretNoteId(api)).toBe('note4');

        await act(async () => {
          if (navigation === 'command') {
            api.editor.dispatchCommand(ZOOM_OUT_COMMAND, undefined);
          } else {
            await router.navigate(createDocumentPath(docId, 'note1'));
          }
        });
        await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
        expect(router.state.location.pathname).toBe(createDocumentPath(docId, 'note1'));
        expect(readCaretNoteId(api)).toBe('note4');

        await act(async () => release());
        expect(router.state.location.pathname).toBe(createDocumentPath(docId, 'note1'));
        expect(readCaretNoteId(api)).toBe('note4');
      } finally {
        release();
      }
    }
  );
});
