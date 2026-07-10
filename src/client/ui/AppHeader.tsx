import { Anchor, Container, Group, Text } from '@mantine/core';
import { Link, NavLink } from 'react-router-dom';
import { DevToolbarLinksSeam } from '#client/app/routes/DevToolbarSeam';
import styles from './AppHeader.module.css';
import { APP_TITLE } from './navigation-label';

export type AppHeaderAuthState =
  | { status: 'authenticated'; isAdmin: boolean }
  | { status: 'offline-remembered' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export interface AppHeaderProps {
  authState: AppHeaderAuthState;
}

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return [styles.link, isActive && styles.activeLink].filter(Boolean).join(' ');
}

export default function AppHeader({ authState }: AppHeaderProps) {
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
              <NavLink className={navLinkClassName} to="/login">
                Sign in
              </NavLink>
            )}
            <DevToolbarLinksSeam linkClassName={styles.link} />
          </Group>
        </nav>
      </Container>
    </header>
  );
}
