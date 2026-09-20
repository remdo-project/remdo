import { Container, Group, Text, UnstyledButton } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { APP_TITLE } from './navigation-label';

export type AppHeaderAuthState =
  | { status: 'authenticated'; isAdmin: boolean }
  | { status: 'offline-remembered' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export interface AppHeaderProps {
  authState: AppHeaderAuthState;
  onLogout: () => void;
  trailingNav?: ReactNode;
}

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return ['remdo-header-link', isActive && 'remdo-header-active-link'].filter(Boolean).join(' ');
}

export default function AppHeader({ authState, onLogout, trailingNav }: AppHeaderProps) {
  const hasAppAccess = authState.status === 'authenticated'
    || authState.status === 'offline-remembered';

  return (
    <header className="remdo-header">
      <Container className="remdo-header-inner" size="xl">
        <Link className="remdo-header-brand-link" to="/">
          <span aria-hidden="true" className="remdo-header-brand-icon" />
          <Text component="span" className="remdo-brand-name">{APP_TITLE}</Text>
        </Link>

        <nav aria-label="Primary" className="remdo-header-navigation">
          <Group className="remdo-header-links" gap="md">
            {hasAppAccess && (
              <a className="remdo-header-link" href="/about/">
                About
              </a>
            )}
            {authState.status === 'authenticated' && authState.isAdmin && (
              <a className="remdo-header-link" href="/admin/">
                Admin
              </a>
            )}
            {hasAppAccess && (
              <UnstyledButton className="remdo-header-link" onClick={onLogout}>
                Logout
              </UnstyledButton>
            )}
            {authState.status === 'unauthenticated' && (
              <NavLink className={navLinkClassName} to="/">
                Sign in
              </NavLink>
            )}
            {trailingNav}
          </Group>
        </nav>
      </Container>
    </header>
  );
}
