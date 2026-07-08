import type { ReactNode } from 'react';
import { Anchor, Container, Group, Title } from '@mantine/core';
import { useEffect } from 'react';
import { Link, Outlet } from 'react-router-dom';
import headerStyles from './styles/AppHeader.module.css';
import { startUserData, useCurrentUserRole } from './documents/user-data';
import { DevToolbarLinksSlot } from './routes/DevToolbarSlot';

// The authenticated app shell: signed-in chrome (nav) plus the live user-data
// runtime. It mounts only for an authenticated user, so it starts the runtime
// unconditionally. Used both as a route layout (renders <Outlet/>) and directly
// as a wrapper around a single authenticated view (renders `children`) — e.g. the
// admin panel, whose route also serves the unauthenticated enroll form outside
// this shell.
export default function AuthenticatedApp({ children }: { children?: ReactNode }) {
  useEffect(() => {
    startUserData();
  }, []);
  // Surface the admin panel link only to admins; route access stays enforced
  // server-side. Reactive to the bootstrap load so it appears once the role is known.
  const isAdmin = useCurrentUserRole() === 'admin';

  return (
    <Container size="xl" py="xl">
      <header className="app-header">
        <Group gap="md">
          <Title order={1} className="app-heading-title">
            <Link
              to="/home"
              className={headerStyles.brandLink}
            >
              <span aria-hidden="true" className={headerStyles.brandIcon} />
              RemDo
            </Link>
          </Title>
        </Group>
        <nav>
          <Group gap="md" className="app-header-links">
            {isAdmin && (
              <Anchor
                className="app-header-link"
                component={Link}
                to="/admin"
              >
                Admin
              </Anchor>
            )}
            <Anchor
              className="app-header-link"
              component={Link}
              to="/sharing"
            >
              Sharing
            </Anchor>
            {/* Logout deliberately leaves the app shell (it tears down local
                state and ends at /login), so a full navigation is correct here. */}
            <Anchor
              className="app-header-link"
              href="/logout"
            >
              Logout
            </Anchor>
            <DevToolbarLinksSlot />
          </Group>
        </nav>
      </header>

      {children ?? <Outlet />}
    </Container>
  );
}
