import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createUserDataRootNote } from '#note-sdk';
import type { UserDocument } from '#note-sdk';
import type { DocumentAccessView } from '#domain/documents/access';
import { createObservableDocumentList } from '#tests';
import { DocumentShareDialog } from './DocumentShareDialog';

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
  const { source, replace: replaceListing } = createObservableDocumentList(documents);
  const note = createUserDataRootNote(source, { shareDocument }).getDocuments().getById('doc-a')!;
  const view = render(
    <MantineProvider>
      <DocumentShareDialog note={note} onClose={onClose} />
    </MantineProvider>
  );
  return { ...view, replaceListing, onClose };
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
    const { replaceListing } = renderDialog({
      shareDocument: async () => {
        replaceListing([{ ...DOC, access: [access] }]);
        return access;
      },
    });

    invite('bob@example.test');

    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Only you have access.')).toBeNull();
  });

  it('shows a rename and a grant made elsewhere while open', () => {
    const { replaceListing } = renderDialog();

    act(() => replaceListing([{
      ...DOC,
      title: 'Quarterly plan',
      access: [{ documentId: 'doc-a', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob' }],
    }]));

    expect(screen.getByRole('dialog', { name: /Quarterly plan/u })).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows a change that lands before it starts observing', () => {
    const { source, replace } = createObservableDocumentList([DOC]);
    const lateSource = {
      ...source,
      subscribe: (listener: () => void) => {
        replace([{ ...DOC, title: 'Quarterly plan' }]);
        return source.subscribe!(listener);
      },
    };
    const note = createUserDataRootNote(lateSource).getDocuments().getById('doc-a')!;

    render(<MantineProvider><DocumentShareDialog note={note} onClose={vi.fn()} /></MantineProvider>);

    expect(screen.getByRole('dialog', { name: /Quarterly plan/u })).toBeInTheDocument();
  });

  it('keeps naming a document that leaves the list and lets its source reject an invite', async () => {
    const shareDocument = vi.fn().mockRejectedValue(new Error('This document is no longer available.'));
    const { replaceListing } = renderDialog({ shareDocument });

    act(() => replaceListing([]));

    expect(screen.getByRole('dialog', { name: /Project Roadmap/u })).toBeInTheDocument();
    expect(screen.getByText('This document is no longer available.')).toBeInTheDocument();
    expect(screen.queryByText('Only you have access.')).toBeNull();
    invite('bob@example.test');
    expect(await screen.findByRole('alert')).toHaveTextContent('This document is no longer available.');
    expect(shareDocument).toHaveBeenCalledWith('doc-a', 'bob@example.test');
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
