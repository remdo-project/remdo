import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import * as pendingDocumentImports from '#client/editor/runtime/pending-document-import';
import {
  renderDocumentRoute,
  resetDocumentRouteHarness,
} from '../../../../../tests/unit/_support/document-route-harness';

let track: Mock<(event: string) => void>;

beforeEach(() => {
  resetDocumentRouteHarness();
  track = vi.fn<(event: string) => void>();
  window.remdoAnalyticsAllowed = true;
  window.umami = { identify: vi.fn(), track };
});

afterEach(() => {
  vi.restoreAllMocks();
  delete window.remdoAnalyticsAllowed;
  delete window.umami;
});

describe('product analytics events', () => {
  it('reports a created document', async () => {
    renderDocumentRoute('/');
    fireEvent.click(await screen.findByRole('button', { name: 'New document' }));
    const dialog = await screen.findByRole('dialog', { name: 'New document' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create document' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(track).toHaveBeenCalledExactlyOnceWith('document-created');
  });

  it('does not report an uploaded document as created', async () => {
    const registerPendingImport = vi.spyOn(pendingDocumentImports, 'registerPendingDocumentImport');
    renderDocumentRoute('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Upload document' }));
    const file = new File(['{"root":{"type":"root","children":[]}}'], 'Backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Upload document'), { target: { files: [file] } });

    await waitFor(() => expect(registerPendingImport).toHaveBeenCalledOnce());
    expect(track).not.toHaveBeenCalled();
  });

  it('reports one search per search session, counting it once consent is granted', async () => {
    renderDocumentRoute();
    const input = await screen.findByRole('combobox', { name: 'Search document' });
    act(() => input.focus());
    window.remdoAnalyticsAllowed = false;

    fireEvent.change(input, { target: { value: 'before consent' } });
    expect(track).not.toHaveBeenCalled();

    window.remdoAnalyticsAllowed = true;
    fireEvent.change(input, { target: { value: 'after consent' } });
    fireEvent.change(input, { target: { value: 'after consent, refined' } });
    expect(track).toHaveBeenCalledExactlyOnceWith('search-used');
  });
});
