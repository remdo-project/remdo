import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createUserDataRootNote } from '#note-sdk';
import type { UserDataNote, UserDocument } from '#note-sdk';
import type { DocumentAccessView } from '#domain/documents/access';
import { DocumentShareDialog } from './DocumentShareDialog';

const routeState = vi.hoisted(() => ({ userData: null as UserDataNote | null }));
vi.mock('#client/app/user-data/user-data', () => ({
  useUserData: () => routeState.userData,
}));

const DOC: UserDocument = { id: 'doc-a', title: 'Project Roadmap', shareable: true, access: [] };

function renderDialog({
  documents = [DOC],
  shareDocument,
  onClose = vi.fn(),
}: {
  documents?: readonly UserDocument[];
  shareDocument?: NonNullable<Parameters<typeof createUserDataRootNote>[1]>['shareDocument'];
  onClose?: () => void;
} = {}) {
  // A mutable listing, so the dialog re-resolves its document the way the live
  // query cache updates it after a grant lands.
  const listing = [...documents];
  const source = {
    getChildren: () => listing,
    getById: (id: string) => listing.find((item) => item.id === id) ?? null,
  };
  routeState.userData = createUserDataRootNote(source, { shareDocument });
  const view = render(
    <MantineProvider>
      <DocumentShareDialog docId="doc-a" onClose={onClose} />
    </MantineProvider>
  );
  return { ...view, listing, onClose };
}

const invite = (email: string) => {
  fireEvent.change(screen.getByLabelText(/Invite by email/u), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
};

describe('document share dialog', () => {
  it('names the document it acts on', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: /Project Roadmap/u })).toBeInTheDocument();
  });

  it('states that only the owner has access before any grant', () => {
    renderDialog();
    expect(screen.getByText('Only you have access.')).toBeInTheDocument();
  });

  it('shows a granted recipient without reopening the dialog', async () => {
    const access: DocumentAccessView = {
      documentId: 'doc-a', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob',
    };
    const { listing } = renderDialog({
      shareDocument: async () => {
        // The live cache replaces the listing entry; the dialog must re-read it.
        listing[0] = { ...DOC, access: [access] };
        return access;
      },
    });

    invite('bob@example.test');

    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Only you have access.')).toBeNull();
  });

  it('reports a rejected address against the address it was given', async () => {
    renderDialog({
      shareDocument: () => Promise.reject(new Error('No account with this email exists on this server.')),
    });

    invite('missing@example.test');

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('No account with this email exists on this server.');
    expect(screen.getByLabelText(/Invite by email/u)).toHaveValue('missing@example.test');
  });

  it('locks the invite while the grant is in flight', async () => {
    let settle!: (access: DocumentAccessView) => void;
    renderDialog({
      shareDocument: () => new Promise<DocumentAccessView>((resolve) => { settle = resolve; }),
    });

    invite('bob@example.test');

    await waitFor(() => expect(screen.getByLabelText(/Invite by email/u)).toBeDisabled());
    settle({ documentId: 'doc-a', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob' });
    await waitFor(() => expect(screen.getByLabelText(/Invite by email/u)).toBeEnabled());
  });

  it('clears the invited address once the grant is accepted', async () => {
    renderDialog({
      shareDocument: async () => ({
        documentId: 'doc-a', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob',
      }),
    });

    invite('bob@example.test');

    await waitFor(() => expect(screen.getByLabelText(/Invite by email/u)).toHaveValue(''));
  });

  it('offers no link sharing and says so', () => {
    renderDialog();
    expect(screen.getByLabelText('Anyone with the link')).toBeDisabled();
    expect(screen.getByText('Link sharing is not available yet.')).toBeInTheDocument();
  });

  it('closes without a combined submission', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
