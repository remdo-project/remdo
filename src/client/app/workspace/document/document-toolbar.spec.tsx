import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestUserData } from '#tests';
import * as pendingDocumentImports from '#client/editor/runtime/pending-document-import';
import { createDocumentPath } from '#document-routes';
import {
  renderDocumentRoute,
  resetDocumentRouteHarness,
} from '../../../../../tests/unit/_support/document-route-harness';
import DocumentToolbar from './DocumentToolbar';

describe('document toolbar and import', () => {

  beforeEach(() => {
    resetDocumentRouteHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const openHome = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Home' }));
  };

  const clickNewDocument = async () => {
    await openHome();
    fireEvent.click(await screen.findByRole('button', { name: 'New document' }));
  };

  const clickUploadDocument = async () => {
    await openHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Upload document' }));
  };

  const rejectDocumentCreation = (message = 'offline') => {
    const userData = getTestUserData();
    const realDocuments = userData.documents.bind(userData);
    vi.spyOn(userData, 'documents').mockImplementation(() => ({
      ...realDocuments(),
      create: vi.fn().mockRejectedValue(new Error(message)),
    }));
  };

  const openDocumentPicker = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Show documents' }));
  };

  it('lists the current document among unfiltered picker options', async () => {
    renderDocumentRoute();

    await openDocumentPicker();

    expect(await screen.findByRole('option', { name: 'Test Document' })).toBeInTheDocument();
  });

  it('selects a different document once when the option is pressed', async () => {
    const onSelectDocument = vi.fn();
    render(
      <DocumentToolbar
        docId="routeDoc"
        documentLabel="routeDoc"
        documentSources={getTestUserData().documentSources().children()}
        onSelectDocument={onSelectDocument}
        onSelectHome={() => {}}
        onSelectNoteId={() => {}}
        onStatusHostChange={() => {}}
        path={[]}
        searchControl={null}
      />,
    );

    await openDocumentPicker();
    const nextDocument = await screen.findByRole('option', { name: 'Test Document' });
    fireEvent.pointerDown(nextDocument, { pointerType: 'mouse' });
    fireEvent.pointerUp(nextDocument, { pointerType: 'mouse' });
    fireEvent.click(nextDocument);

    expect(onSelectDocument).toHaveBeenCalledTimes(1);
    expect(onSelectDocument).toHaveBeenCalledWith('testDoc');
  });

  it('does not select a document when a filter edit is dismissed', async () => {
    const onSelectDocument = vi.fn();
    render(
      <DocumentToolbar
        docId="testDoc"
        documentLabel="Test Document"
        documentSources={getTestUserData().documentSources().children()}
        onSelectDocument={onSelectDocument}
        onSelectHome={() => {}}
        onSelectNoteId={() => {}}
        onStatusHostChange={() => {}}
        path={[]}
        searchControl={null}
      />,
    );

    await openDocumentPicker();
    const picker = await screen.findByRole('combobox', { name: 'Choose document' });
    fireEvent.change(picker, { target: { value: 'NoSuchDocument' } });
    fireEvent.blur(picker);

    expect(onSelectDocument).not.toHaveBeenCalled();
  });

  it('keeps the current document labeled when it is not in the source list', async () => {
    renderDocumentRoute();

    expect(await screen.findByRole('combobox', { name: 'Choose document' })).toHaveValue('routeDoc');

    await openDocumentPicker();

    expect(await screen.findByRole('option', { name: 'routeDoc' })).toBeInTheDocument();
  });

  it('filters picker options after the current name is edited', async () => {
    renderDocumentRoute();

    await openDocumentPicker();
    expect(await screen.findByRole('option', { name: 'Test Document' })).toBeInTheDocument();

    fireEvent.change(await screen.findByRole('combobox', { name: 'Choose document' }), {
      target: { value: 'NoSuchDocument' },
    });

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Test Document' })).toBeNull();
    });
  });

  it('creates a document from the selected backup filename before registering the pending import', async () => {
    const registerPendingImport = vi.spyOn(pendingDocumentImports, 'registerPendingDocumentImport');
    const router = renderDocumentRoute();
    await clickUploadDocument();

    const file = new File(['{"root":{"type":"root","children":[]}}'], ' Project Backup.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByLabelText('Upload document'), {
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
    rejectDocumentCreation();

    renderDocumentRoute();
    await clickUploadDocument();
    fireEvent.change(screen.getByLabelText('Upload document'), {
      target: { files: [new File(['{}'], 'backup.json', { type: 'application/json' })] },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not create document');
    expect(alert).toHaveTextContent('offline');
    expect(registerPendingImport).not.toHaveBeenCalled();
  });

  it('surfaces an alert when creating a new document fails', async () => {
    rejectDocumentCreation();

    renderDocumentRoute();
    await clickNewDocument();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not create document');
    expect(alert).toHaveTextContent('offline');
  });

  it('dismisses the creation error alert via its close button', async () => {
    rejectDocumentCreation();

    renderDocumentRoute();
    await clickNewDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('clears the creation error when navigating to another document', async () => {
    rejectDocumentCreation();

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
