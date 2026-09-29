import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestUserData } from '#tests';
import { createDocumentPath } from '#document-routes';
import {
  renderDocumentRoute,
  renderDocumentRouteWithResult,
  resetDocumentRouteHarness,
  setMockZoomPath,
} from '../../../../tests/unit/_support/document-route-harness';

describe('document route', () => {
  beforeEach(() => {
    resetDocumentRouteHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back to the route document id in the page title at the root', async () => {
    renderDocumentRoute();

    await waitFor(() => {
      expect(document.title).toBe('routeDoc · RemDo');
    });
  });

  it('uses listed document titles instead of route document ids in the page title', async () => {
    const createdDocument = await getTestUserData().getDocuments().create('  Project\nNotes  ');
    renderDocumentRoute(createDocumentPath(createdDocument.getId()));

    await waitFor(() => {
      expect(document.title).toBe('Project Notes · RemDo');
    });
  });

  it('navigates to the default document using its document URL', async () => {
    const router = renderDocumentRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'Show documents' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Test Document' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('testDoc'));
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-doc-id', 'testDoc');
    });
  });

  it('sets the page title from the current zoom note when zoomed', async () => {
    setMockZoomPath('routeDoc', 'note3', [
      { noteId: 'note1', label: 'Parent' },
      { noteId: 'note3', label: '  Current\nNote  ' },
    ]);

    renderDocumentRoute(createDocumentPath('routeDoc', 'note3'));

    await waitFor(() => {
      expect(document.title).toBe('Current Note · routeDoc · RemDo');
    });
  });

  it('heads the document-root view with the full document name and hides the heading when zoomed', async () => {
    const name = `Quarterly ${'planning '.repeat(8)}notes`;
    const createdDocument = await getTestUserData().getDocuments().create(name);
    renderDocumentRoute(createDocumentPath(createdDocument.getId()));

    expect(await screen.findByRole('heading', { level: 1, name })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom note' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    });
  });

  it('starts each opened document with the header as the menu target', async () => {
    const second = await getTestUserData().getDocuments().create('Second Document');
    renderDocumentRoute(createDocumentPath('testDoc'));

    fireEvent.focus(await screen.findByTestId('editor-input-probe'));
    expect(document.querySelector('.document-editor-shell')).toHaveAttribute('data-menu-target', 'note');

    fireEvent.click(await screen.findByRole('button', { name: 'Show documents' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Second Document' }));

    await waitFor(() => {
      expect(screen.getByTestId('editor-probe')).toHaveAttribute('data-doc-id', second.getId());
    });
    expect(document.querySelector('.document-editor-shell')).toHaveAttribute('data-menu-target', 'header');
  });

  it('targets the header while search hides the editor', async () => {
    renderDocumentRoute(createDocumentPath('testDoc'));

    fireEvent.focus(await screen.findByTestId('editor-input-probe'));
    expect(document.querySelector('.document-editor-shell')).toHaveAttribute('data-menu-target', 'note');

    const searchInput = await screen.findByRole('combobox', { name: 'Search document' });
    act(() => searchInput.focus());
    fireEvent.change(searchInput, { target: { value: 'note' } });

    await waitFor(() => {
      expect(document.querySelector('.document-editor-pane--hidden')).not.toBeNull();
    });
    expect(document.querySelector('.document-editor-shell')).toHaveAttribute('data-menu-target', 'header');
  });

  it('targets the note strip while the document has no header menu', async () => {
    renderDocumentRoute();

    await screen.findByTestId('editor-probe');

    expect(document.querySelector('.document-editor-shell')).toHaveAttribute('data-menu-target', 'note');
  });

  it('returns to the document URL when zoom is cleared', async () => {
    const router = renderDocumentRoute(createDocumentPath('testDoc'));

    fireEvent.click(await screen.findByRole('button', { name: 'Zoom note' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('testDoc', 'note3'));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear zoom' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('testDoc'));
    });
  });

  it('clears zoom when the current document is pressed in the picker', async () => {
    const router = renderDocumentRoute(createDocumentPath('testDoc'));

    fireEvent.click(await screen.findByRole('button', { name: 'Zoom note' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('testDoc', 'note3'));
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Show documents' }));
    const currentDocument = await screen.findByRole('option', { name: 'Test Document' });
    fireEvent.pointerDown(currentDocument, { pointerType: 'mouse' });
    fireEvent.pointerUp(currentDocument, { pointerType: 'mouse' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(createDocumentPath('testDoc'));
    });
  });

  it('resets the page title when the route unmounts', async () => {
    const { result } = renderDocumentRouteWithResult();

    await waitFor(() => {
      expect(document.title).toBe('routeDoc · RemDo');
    });
    result.unmount();

    expect(document.title).toBe('RemDo');
  });

  it('remounts editor when document id changes via route params', async () => {
    const router = renderDocumentRoute();

    const first = await screen.findByTestId('editor-probe');
    const firstInstanceId = first.dataset.instanceId;
    expect(first.dataset.docId).toBe('routeDoc');

    await router.navigate(createDocumentPath('other'));

    await waitFor(() => {
      expect(screen.getByTestId('editor-probe').dataset.docId).toBe('other');
    });

    const second = screen.getByTestId('editor-probe');
    expect(second.dataset.instanceId).not.toBe(firstInstanceId);
  });
});
