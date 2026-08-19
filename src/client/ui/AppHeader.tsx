import { Anchor, Container, Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import styles from './AppHeader.module.css';
import { APP_TITLE } from './navigation-label';

export type AppHeaderAuthState =
  | { status: 'authenticated'; isAdmin: boolean }
  | { status: 'offline-remembered' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export interface AppHeaderProps {
  authState: AppHeaderAuthState;
  trailingNav?: ReactNode;
}

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return [styles.link, isActive && styles.activeLink].filter(Boolean).join(' ');
}

export default function AppHeader({ authState, trailingNav }: AppHeaderProps) {
  const hasAppAccess = authState.status === 'authenticated'
    || authState.status === 'offline-remembered';

  return (
    <header className={styles.header}>
      <Container className={styles.inner} size="xl">
        <Link className={styles.brandLink} to="/">
          <span aria-hidden="true" className={styles.brandIcon} />
          <Text component="span" fw={700} size="xl">{APP_TITLE}</Text>
        </Link>

        <nav aria-label="Primary" className={styles.navigation}>
          <Group className={styles.links} gap="md">
            {authState.status === 'authenticated' && authState.isAdmin && (
              <NavLink className={navLinkClassName} to="/admin">
                Admin
              </NavLink>
            )}
            {hasAppAccess && (
              <NavLink className={navLinkClassName} to="/sharing">
                Sharing
              </NavLink>
            )}
            {hasAppAccess && (
              <Anchor className={styles.link} href="/logout">
                Logout
              </Anchor>
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
