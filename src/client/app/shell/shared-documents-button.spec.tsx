import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { createUserDataRootNote, NoteUnavailableError } from '#note-sdk';
import type { UserDataNote, UserDocument } from '#note-sdk';
import { TestMantineProvider } from '#tests';
import { SharedDocumentsButton } from './SharedDocumentsButton';

let userData: UserDataNote;
let status = { error: null as string | null, loading: false, retry: vi.fn() };
let host: HTMLElement;

vi.mock('#client/app/user-data/user-data', () => ({
  useUserData: () => userData,
  useUserDataStatus: () => status,
}));

function Destination() {
  const location = useLocation();
  return <p data-testid="destination">{location.pathname}</p>;
}

function renderButton(documents: readonly UserDocument[] = []) {
  userData = createUserDataRootNote(documents, { shareDocument: vi.fn() });
  return render(
    <TestMantineProvider>
      <MemoryRouter>
        <SharedDocumentsButton host={host} />
        <Destination />
      </MemoryRouter>
    </TestMantineProvider>,
  );
}

beforeEach(() => {
  status = { error: null, loading: false, retry: vi.fn() };
  host = document.createElement('span');
  document.body.append(host);
});

afterEach(() => { host.remove(); });

describe('shared documents bell', () => {
  it('lists only received documents and opens their document-root view', async () => {
    renderButton([
      { id: 'mine', title: 'Private plan', shareable: true },
      { id: 'mineShared', title: 'My shared plan', shareable: true, access: [{ documentId: 'mineShared', granteeUserId: 'other', email: 'other@example.test', name: 'Other' }] },
      { id: 'received', title: 'Team notes', shareable: false },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Shared with you' }));
    const panel = await screen.findByRole('dialog', { name: 'Shared with you' });
    expect(within(panel).queryByText('Private plan')).toBeNull();
    expect(within(panel).queryByText('My shared plan')).toBeNull();
    const link = within(panel).getByRole('link', { name: /Team notes/u });
    expect(link).toHaveAttribute('href', '/n/received');
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByTestId('destination')).toHaveTextContent('/n/received'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows an empty received-document list after loading', async () => {
    renderButton([{ id: 'mine', title: 'Private plan', shareable: true }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Shared with you' }));
    expect(await screen.findByText('Nothing shared with you yet.')).toBeInTheDocument();
  });

  it('distinguishes loading from an empty list', async () => {
    status.loading = true;
    renderButton();
    vi.spyOn(userData.documents, 'getChildren').mockImplementation(() => { throw new NoteUnavailableError('user-documents'); });
    fireEvent.click(await screen.findByRole('button', { name: 'Shared with you' }));
    expect(await screen.findByText('Loading documents…')).toBeInTheDocument();
    expect(screen.queryByText('Nothing shared with you yet.')).toBeNull();
  });

  it('reports an unavailable initial listing without claiming it is empty', async () => {
    status.error = 'The document server is unavailable.';
    renderButton();
    vi.spyOn(userData.documents, 'getChildren').mockImplementation(() => { throw new NoteUnavailableError('user-documents'); });
    fireEvent.click(await screen.findByRole('button', { name: 'Shared with you' }));

    const panel = await screen.findByRole('dialog', { name: 'Shared with you' });
    expect(within(panel).getByRole('alert')).toHaveTextContent(status.error);
    expect(within(panel).queryByText('Nothing shared with you yet.')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Retry' }));
    expect(status.retry).toHaveBeenCalledOnce();
  });

  it('reports an unavailable listing, retains cached entries, and retries on request', async () => {
    status.error = 'The document server is unavailable.';
    renderButton([{ id: 'received', title: 'Cached shared notes', shareable: false }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Shared with you' }));
    const panel = await screen.findByRole('dialog', { name: 'Shared with you' });
    expect(within(panel).getByRole('alert')).toHaveTextContent(status.error);
    expect(within(panel).getByRole('link', { name: /Cached shared notes/u })).toHaveAttribute('href', '/n/received');
    fireEvent.click(within(panel).getByRole('button', { name: 'Retry' }));
    expect(status.retry).toHaveBeenCalledOnce();
    expect(within(panel).queryByText('Nothing shared with you yet.')).toBeNull();
  });
});
