import { MantineProvider } from '@mantine/core';
import { fireEvent, render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasUnsyncedLocalChanges } from '#collaboration/session';
import { useLogout } from './useLogout';
import { logoutCurrentUser } from './logout';
import UnsyncedLogoutDialog from '#client/ui/UnsyncedLogoutDialog';

vi.mock('#collaboration/session', () => ({
  hasUnsyncedLocalChanges: vi.fn(() => false),
}));

vi.mock('./logout', () => ({
  logoutCurrentUser: vi.fn(async () => {}),
}));

vi.mock('./logout-broadcast', () => ({
  broadcastSignOut: vi.fn(),
}));

function LogoutHarness() {
  const logout = useLogout();
  return (
    <>
      <button onClick={logout.requestLogout} type="button">Logout</button>
      <UnsyncedLogoutDialog
        onCancel={logout.cancelLogout}
        onConfirm={logout.confirmLogout}
        opened={logout.confirmingLoss}
      />
    </>
  );
}

function renderHarness() {
  // The shared jsdom document already hosts a mounted editor, so queries are
  // scoped to this render's own container rather than the whole body.
  const container = document.createElement('div');
  document.body.append(container);
  const view = render(
    <MantineProvider>
      <MemoryRouter>
        <LogoutHarness />
      </MemoryRouter>
    </MantineProvider>,
    { baseElement: container, container }
  );
  // Mantine portals the modal outside this render's container.
  const dialog = () => document.body.querySelector('[role="dialog"]');
  return { ...view, ui: within(container), dialog };
}

describe('logout with unsynced local edits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs out without asking when the server has acknowledged every edit', () => {
    vi.mocked(hasUnsyncedLocalChanges).mockReturnValue(false);

    const { dialog, ui } = renderHarness();
    fireEvent.click(ui.getByRole('button', { name: 'Logout' }));

    // Acknowledged work survives signing back in, so a dialog here would be the
    // routine prompt that trains users to dismiss it.
    expect(dialog()).toBeNull();
    expect(logoutCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('states what is lost before discarding it', () => {
    vi.mocked(hasUnsyncedLocalChanges).mockReturnValue(true);

    const { dialog, ui } = renderHarness();
    fireEvent.click(ui.getByRole('button', { name: 'Logout' }));

    expect(dialog()).toHaveTextContent(/have not reached the server/iu);
    expect(dialog()).toHaveTextContent(/cannot be recovered/iu);
    expect(logoutCurrentUser).not.toHaveBeenCalled();
  });

  it('keeps the session when the warning is declined', () => {
    vi.mocked(hasUnsyncedLocalChanges).mockReturnValue(true);

    const { dialog, ui } = renderHarness();
    fireEvent.click(ui.getByRole('button', { name: 'Logout' }));
    fireEvent.click(within(document.body).getByRole('button', { name: 'Cancel' }));

    expect(logoutCurrentUser).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it('signs out once the loss is accepted', () => {
    vi.mocked(hasUnsyncedLocalChanges).mockReturnValue(true);

    const { ui } = renderHarness();
    fireEvent.click(ui.getByRole('button', { name: 'Logout' }));
    fireEvent.click(within(document.body).getByRole('button', { name: 'Sign out and discard' }));

    expect(logoutCurrentUser).toHaveBeenCalledTimes(1);
  });
});
