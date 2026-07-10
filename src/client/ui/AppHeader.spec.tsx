import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AppHeader from './AppHeader';
import type { AppHeaderAuthState } from './AppHeader';

vi.mock('#client/app/routes/DevToolbarSeam', () => ({
  DevToolbarLinksSeam: () => null,
}));

function renderHeader(authState: AppHeaderAuthState) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <AppHeader authState={authState} />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe('app header', () => {
  it('shows sign-in navigation to an unauthenticated visitor', () => {
    renderHeader({ status: 'unauthenticated' });

    expect(screen.getByRole('link', { name: 'RemDo' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: 'Sharing' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Logout' })).toBeNull();
  });

  it('shows full application navigation to an admin', () => {
    renderHeader({ status: 'authenticated', isAdmin: true });

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'Sharing' })).toHaveAttribute('href', '/sharing');
    expect(screen.getByRole('link', { name: 'Logout' })).toHaveAttribute('href', '/logout');
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('omits admin navigation for a non-admin', () => {
    renderHeader({ status: 'authenticated', isAdmin: false });

    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sharing' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Logout' })).toBeInTheDocument();
  });

  it('keeps offline app navigation without claiming an admin role', () => {
    renderHeader({ status: 'offline-remembered' });

    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sharing' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Logout' })).toBeInTheDocument();
  });

  it('renders only the brand when session state is unavailable', () => {
    renderHeader({ status: 'unavailable' });

    expect(screen.getByRole('link', { name: 'RemDo' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /admin|sharing|logout|sign in/iu })).toBeNull();
  });
});
