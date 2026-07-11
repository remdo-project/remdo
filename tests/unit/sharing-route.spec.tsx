import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SharingRoute from '#client/app/routes/SharingRoute';
import { createUserDataRootNote } from '#note-sdk';
import type { UserDataNote, UserDocument } from '#note-sdk';
import type { DocumentAccessView } from '#domain/documents/access';
import type { SourceServer } from '#domain/source-servers';

const routeState = vi.hoisted(() => ({
  isPublicServer: null as boolean | null,
  linkSourceByUrl: vi.fn(),
  userData: null as UserDataNote | null,
}));

vi.mock('#client/app/documents/user-data', () => ({
  useCurrentUserPublicServer: () => routeState.isPublicServer,
  useUserData: () => routeState.userData,
}));

vi.mock('#client/app/auth/source-server-linking-client', () => ({
  linkSourceByUrl: routeState.linkSourceByUrl,
}));

interface SharingRouteFixture {
  documents?: readonly UserDocument[];
  isPublicServer?: boolean | null;
  shareDocument?: NonNullable<Parameters<typeof createUserDataRootNote>[2]>['shareDocument'];
  sourceServers?: readonly SourceServer[];
}

function renderSharingRoute({
  documents = [],
  isPublicServer = false,
  shareDocument,
  sourceServers = [],
}: SharingRouteFixture = {}) {
  routeState.isPublicServer = isPublicServer;
  routeState.userData = createUserDataRootNote(documents, sourceServers, { shareDocument });

  return render(
    <MantineProvider>
      <SharingRoute />
    </MantineProvider>
  );
}

function chooseDocument(name: string) {
  fireEvent.click(screen.getByRole('option', { hidden: true, name }));
}

function createPendingShare() {
  let resolve!: (access: DocumentAccessView) => void;
  const promise = new Promise<DocumentAccessView>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('sharing route', () => {
  it('lists only documents that the current user can share', () => {
    renderSharingRoute({
      documents: [
        { id: 'home', shareable: false, title: 'Home' },
        { id: 'owned', shareable: true, title: 'Owned' },
        { id: 'shared', shareable: false, title: 'Shared with me' },
      ],
    });

    expect(screen.getByRole('option', { hidden: true, name: 'Owned' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { hidden: true, name: 'Home' })).toBeNull();
    expect(screen.queryByRole('option', { hidden: true, name: 'Shared with me' })).toBeNull();
  });

  it('keeps document and source management explicit when nothing is selected or linked', () => {
    renderSharingRoute({
      documents: [{ id: 'owned', shareable: true, title: 'Owned' }],
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Sharing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Document access' })).toBeInTheDocument();
    expect(screen.getByText('Choose a document to manage access.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
    expect(screen.getByRole('heading', { level: 2, name: 'Linked sources' })).toBeInTheDocument();
    expect(screen.getByText('No linked sources.')).toBeInTheDocument();
  });

  it('explains when no owned documents are shareable', () => {
    renderSharingRoute({
      documents: [{ id: 'shared', shareable: false, title: 'Shared with me' }],
    });

    expect(screen.getByText('No documents you own can be shared.')).toBeInTheDocument();
  });

  it('separates server policy readiness from user-data projection readiness', () => {
    const route = renderSharingRoute({ isPublicServer: null });

    expect(screen.queryByText('No documents you own can be shared.')).toBeNull();
    expect(screen.queryByText('No linked sources.')).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Linked sources' })).toBeNull();

    routeState.isPublicServer = false;
    route.rerender(
      <MantineProvider>
        <SharingRoute />
      </MantineProvider>
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Linked sources' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Source URL' })).toBeInTheDocument();
    expect(screen.queryByText('No linked sources.')).toBeNull();

    routeState.isPublicServer = true;
    route.rerender(
      <MantineProvider>
        <SharingRoute />
      </MantineProvider>
    );

    expect(screen.queryByRole('heading', { level: 2, name: 'Linked sources' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Source URL' })).toBeNull();
  });

  it('shows the selected document access state', () => {
    renderSharingRoute({
      documents: [{
        access: [{
          documentId: 'owned',
          email: 'reader@example.com',
          granteeUserId: 'reader',
          name: 'Reader',
        }],
        id: 'owned',
        shareable: true,
        title: 'Owned',
      }],
    });

    chooseDocument('Owned');

    expect(screen.getByRole('heading', { level: 3, name: 'People with access' })).toBeInTheDocument();
    expect(screen.getByText('Reader')).toBeInTheDocument();
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled();
  });

  it('shows an owner-only state after selecting a document with no grants', () => {
    renderSharingRoute({
      documents: [{ id: 'owned', shareable: true, title: 'Owned' }],
    });

    const emailInput = screen.getByRole('textbox', { name: 'User email' });
    fireEvent.change(emailInput, { target: { value: 'reader@example.com' } });
    chooseDocument('Owned');

    expect(screen.getByText('Only you have access.')).toBeInTheDocument();
    expect(emailInput).toHaveValue('reader@example.com');
  });

  it('omits source management on a public server without linked sources', () => {
    renderSharingRoute({ isPublicServer: true });

    expect(screen.queryByRole('heading', { level: 2, name: 'Linked sources' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Source URL' })).toBeNull();
  });

  it('lists existing sources without a link form on a public server', () => {
    renderSharingRoute({
      isPublicServer: true,
      sourceServers: [{
        baseUrl: 'https://source.example',
        id: 'source',
        label: 'Source Server',
      }],
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Linked sources' })).toBeInTheDocument();
    expect(screen.getByText('Source Server')).toBeInTheDocument();
    expect(screen.getByText('https://source.example')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Source URL' })).toBeNull();
  });

  it('submits a normalized source URL', () => {
    routeState.linkSourceByUrl.mockResolvedValue(undefined);
    renderSharingRoute();

    fireEvent.change(screen.getByRole('textbox', { name: 'Source URL' }), {
      target: { value: ' https://source.example ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link source' }));

    expect(routeState.linkSourceByUrl).toHaveBeenCalledWith('https://source.example');
  });

  it('reports a source-linking error within the linked-sources section', async () => {
    routeState.linkSourceByUrl.mockRejectedValue(new Error('Source unavailable.'));
    renderSharingRoute();

    fireEvent.change(screen.getByRole('textbox', { name: 'Source URL' }), {
      target: { value: 'https://source.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link source' }));

    expect(await screen.findByRole('alert', { name: 'Could not link source' }))
      .toHaveTextContent('Source unavailable.');
  });

  it('locks document sharing while the request is pending', async () => {
    const pendingShare = createPendingShare();
    renderSharingRoute({
      documents: [{ id: 'owned', shareable: true, title: 'Owned' }],
      shareDocument: vi.fn().mockReturnValue(pendingShare.promise),
    });

    chooseDocument('Owned');
    const documentSelect = screen.getByRole('combobox', { name: 'Document' });
    const emailInput = screen.getByRole('textbox', { name: 'User email' });
    const shareForm = screen.getByRole('form', { name: 'Share document' });
    const shareButton = screen.getByRole('button', { name: 'Share' });
    fireEvent.change(emailInput, { target: { value: 'reader@example.com' } });
    fireEvent.click(shareButton);

    expect(documentSelect).toBeDisabled();
    expect(emailInput).toBeDisabled();
    expect(shareButton).toBeDisabled();
    expect(shareForm).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      pendingShare.resolve({
        documentId: 'owned',
        email: 'reader@example.com',
        granteeUserId: 'reader',
        name: null,
      });
    });

    expect(documentSelect).toBeEnabled();
    expect(emailInput).toBeEnabled();
    expect(shareButton).toBeEnabled();
    expect(shareForm).toHaveAttribute('aria-busy', 'false');
    expect(emailInput).toHaveValue('');
    expect(screen.queryByText('Only you have access.')).toBeNull();
    expect(screen.getByText('Document shared.')).toBeInTheDocument();
  });

  it('unlocks document sharing after the request fails', async () => {
    renderSharingRoute({
      documents: [
        { id: 'owned', shareable: true, title: 'Owned' },
        { id: 'second', shareable: true, title: 'Second' },
      ],
      shareDocument: vi.fn().mockRejectedValue(new Error('No such user.')),
    });

    chooseDocument('Owned');
    const documentSelect = screen.getByRole('combobox', { name: 'Document' });
    const emailInput = screen.getByRole('textbox', { name: 'User email' });
    const shareButton = screen.getByRole('button', { name: 'Share' });
    fireEvent.change(emailInput, { target: { value: 'missing@example.com' } });
    fireEvent.click(shareButton);

    expect(await screen.findByRole('alert', { name: 'Could not share document' }))
      .toHaveTextContent('No such user.');
    expect(documentSelect).toBeEnabled();
    expect(emailInput).toBeEnabled();
    expect(emailInput).toHaveValue('missing@example.com');
    expect(shareButton).toBeEnabled();

    chooseDocument('Second');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(emailInput).toHaveValue('');
  });
});
