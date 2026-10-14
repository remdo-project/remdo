import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUserDataRootNote } from '#note-sdk';
import type { UserDocument } from '#note-sdk';
import type { DocumentAccessView } from '#domain/documents/access';
import { TestMantineProvider, createObservableDocumentList } from '#tests';
import { DocumentShareDialog } from './DocumentShareDialog';

const DOC: UserDocument = { id: 'docA', title: 'Project Roadmap', shareable: true, access: [] };
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
  window.history.replaceState(null, '', '/');
});

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
  const note = createUserDataRootNote(source, { shareDocument }).getDocuments().getById('docA')!;
  const view = render(
    <TestMantineProvider>
      <DocumentShareDialog note={note} onClose={onClose} />
    </TestMantineProvider>
  );
  return { ...view, replaceListing, onClose };
}

const invite = (email: string) => {
  fireEvent.change(screen.getByLabelText(/Add a person by email/u), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Add access' }));
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
      documentId: 'docA', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob',
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
      access: [{ documentId: 'docA', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob' }],
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
    const note = createUserDataRootNote(lateSource).getDocuments().getById('docA')!;

    render(<TestMantineProvider><DocumentShareDialog note={note} onClose={vi.fn()} /></TestMantineProvider>);

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
    expect(shareDocument).toHaveBeenCalledWith('docA', 'bob@example.test');
  });

  it.each([
    ['missing@example.test', 'No account with this email exists on this server.'],
    ['owner@example.test', 'You already own this document.'],
  ])('reports a rejected invite to %s while retaining the address and recipients', async (email, message) => {
    renderDialog({
      documents: [{ ...DOC, access: [{ documentId: 'docA', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob' }] }],
      shareDocument: () => Promise.reject(new Error(message)),
    });

    invite(email);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText(/Add a person by email/u)).toHaveValue(email);
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('bob@example.test')).toBeInTheDocument();
  });

  it('locks the invite while the grant is in flight', async () => {
    let settle!: (access: DocumentAccessView) => void;
    renderDialog({
      shareDocument: () => new Promise<DocumentAccessView>((resolve) => { settle = resolve; }),
    });

    invite('bob@example.test');

    await waitFor(() => expect(screen.getByLabelText(/Add a person by email/u)).toBeDisabled());
    settle({ documentId: 'docA', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob' });
    await waitFor(() => expect(screen.getByLabelText(/Add a person by email/u)).toBeEnabled());
  });

  it('clears the invited address once the grant is accepted', async () => {
    renderDialog({
      shareDocument: async () => ({
        documentId: 'docA', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob',
      }),
    });

    invite('bob@example.test');

    await waitFor(() => expect(screen.getByLabelText(/Add a person by email/u)).toHaveValue(''));
  });

  it('describes copying a locator without granting access', () => {
    renderDialog();
    expect(screen.getByText('Only people with access')).toBeInTheDocument();
    expect(screen.getByText(/Copying this link does not change access/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled();
  });

  it('shows the owner and editing access and confirms the exact granted address', async () => {
    renderDialog({
      shareDocument: async () => ({ documentId: 'docA', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob' }),
    });
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    invite('  bob@example.test  ');
    expect(await screen.findByRole('status')).toHaveTextContent('Added bob@example.test. They can edit this document. No email was sent.');
  });

  it('reports that a repeated grant already has access after the source accepts it', async () => {
    const grant = { documentId: 'docA', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob' };
    renderDialog({ documents: [{ ...DOC, access: [grant] }], shareDocument: async () => grant });
    expect(screen.getByText('Can edit')).toBeInTheDocument();
    invite('BOB@example.test');
    expect(await screen.findByRole('status')).toHaveTextContent('bob@example.test already has access.');
  });

  it('gives a collaborator only their access summary and a locator', () => {
    renderDialog({
      documents: [{ ...DOC, shareable: false, access: [{ documentId: 'docA', granteeUserId: 'other', email: 'other@example.test', name: 'Other' }] }],
    });
    expect(screen.getByText('Your access')).toBeInTheDocument();
    expect(screen.getByText(/Only its owner can add people/u)).toBeInTheDocument();
    expect(screen.queryByText('other@example.test')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add access' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled();
  });

  it('copies the document-root link rather than the current zoom, query, or fragment', async () => {
    window.history.replaceState(null, '', '/n/docA_zoomNote?debug=1#caret');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const shareDocument = vi.fn();
    renderDialog({ shareDocument });
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied. Access has not changed.');
    expect(writeText).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/n/docA`);
    expect(shareDocument).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'rejected'])('offers a selectable link when clipboard copying is %s', async (kind) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: kind === 'unavailable' ? undefined : { writeText: vi.fn().mockRejectedValue(new Error('Clipboard denied')) },
    });
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    const field = await screen.findByRole('textbox', { name: 'Document link' });
    expect(field).toHaveValue(`${window.location.origin}/n/docA`);
    expect(field).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
  });

  it('closes without a combined submission', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
