import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestUserData } from '#tests';
import * as pendingDocumentImports from '#client/editor/runtime/pending-document-import';
import { createDocumentPath } from '#document-routes';
import {
  renderDocumentRoute,
  resetDocumentRouteHarness,
} from './_support/document-route-harness';

describe('document toolbar and import', () => {

  beforeEach(() => {
    resetDocumentRouteHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const clickNewDocument = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Choose document' }));
    fireEvent.click(await screen.findByRole('option', { hidden: true, name: 'New' }));
  };

  const clickUploadDocument = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Choose document' }));
    fireEvent.click(await screen.findByText('Upload'));
  };

  it('shows the upload action directly below the new document action', async () => {
    renderDocumentRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'Choose document' }));

    const newOption = await screen.findByRole('option', { hidden: true, name: 'New' });
    const uploadOption = (await screen.findByText('Upload')).closest('[role="option"]');
    expect(uploadOption).not.toBeNull();
    expect(newOption.compareDocumentPosition(uploadOption!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('creates a document from the selected backup filename before registering the pending import', async () => {
    const registerPendingImport = vi.spyOn(pendingDocumentImports, 'registerPendingDocumentImport');
    const router = renderDocumentRoute();
    await clickUploadDocument();

    const file = new File(['{"root":{"type":"root","children":[]}}'], ' Project Backup.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByLabelText('Upload document backup'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(registerPendingImport).toHaveBeenCalledTimes(1);
    });

    const [createdDocId, registeredFile] = registerPendingImport.mock.calls[0]!;
    expect(registeredFile).toBe(file);
    expect(getTestUserData().documents().byId(createdDocId)?.text()).toBe('Project Backup');
    expect(router.state.location.pathname).toBe(createDocumentPath(createdDocId));
  });

  it('does not register a pending import when upload document creation fails', async () => {
    const registerPendingImport = vi.spyOn(pendingDocumentImports, 'registerPendingDocumentImport');
    const userData = getTestUserData();
    const realDocuments = userData.documents.bind(userData);
    vi.spyOn(userData, 'documents').mockImplementation(() => ({
      ...realDocuments(),
      create: vi.fn().mockRejectedValue(new Error('offline')),
    }));

    renderDocumentRoute();
    await clickUploadDocument();
    fireEvent.change(screen.getByLabelText('Upload document backup'), {
      target: { files: [new File(['{}'], 'backup.json', { type: 'application/json' })] },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not create document');
    expect(alert).toHaveTextContent('offline');
    expect(registerPendingImport).not.toHaveBeenCalled();
  });

  it('surfaces an alert when creating a new document fails', async () => {
    const userData = getTestUserData();
    const realDocuments = userData.documents.bind(userData);
    vi.spyOn(userData, 'documents').mockImplementation(() => ({
      ...realDocuments(),
      create: vi.fn().mockRejectedValue(new Error('offline')),
    }));

    renderDocumentRoute();
    await clickNewDocument();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not create document');
    expect(alert).toHaveTextContent('offline');
  });

  it('dismisses the creation error alert via its close button', async () => {
    const userData = getTestUserData();
    const realDocuments = userData.documents.bind(userData);
    vi.spyOn(userData, 'documents').mockImplementation(() => ({
      ...realDocuments(),
      create: vi.fn().mockRejectedValue(new Error('offline')),
    }));

    renderDocumentRoute();
    await clickNewDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('clears the creation error when navigating to another document', async () => {
    const userData = getTestUserData();
    const realDocuments = userData.documents.bind(userData);
    vi.spyOn(userData, 'documents').mockImplementation(() => ({
      ...realDocuments(),
      create: vi.fn().mockRejectedValue(new Error('offline')),
    }));

    const router = renderDocumentRoute(createDocumentPath('routeDoc'));
    await clickNewDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await router.navigate(createDocumentPath('other'));

    await waitFor(() => {
      expect(screen.getByTestId('editor-probe').dataset.docId).toBe('other');
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
