import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SharingRoute from '#client/app/sharing/SharingRoute';
import { createUserDataRootNote } from '#note-sdk';
import type { UserDataNote, UserDocument } from '#note-sdk';
import type { DocumentAccessView } from '#domain/documents/access';

const routeState = vi.hoisted(() => ({
  userData: null as UserDataNote | null,
}));

vi.mock('#client/app/user-data/user-data', () => ({
  useUserData: () => routeState.userData,
}));

interface SharingRouteFixture {
  documents?: readonly UserDocument[];
  shareDocument?: NonNullable<Parameters<typeof createUserDataRootNote>[1]>['shareDocument'];
}

function renderSharingRoute({
  documents = [],
  shareDocument,
}: SharingRouteFixture = {}) {
  routeState.userData = createUserDataRootNote(documents, { shareDocument });

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

  it('keeps document access explicit when nothing is selected', () => {
    renderSharingRoute({
      documents: [{ id: 'owned', shareable: true, title: 'Owned' }],
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Sharing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Document access' })).toBeInTheDocument();
    expect(screen.getByText('Choose a document to manage access.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Linked sources' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Link source' })).toBeNull();
  });

  it('explains when no owned documents are shareable', () => {
    renderSharingRoute({
      documents: [{ id: 'shared', shareable: false, title: 'Shared with me' }],
    });

    expect(screen.getByText('No documents you own can be shared.')).toBeInTheDocument();
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
