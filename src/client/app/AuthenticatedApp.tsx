import type { ReactNode } from 'react';
import { Container } from '@mantine/core';
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { startUserData } from './documents/user-data';

// The authenticated app boundary starts the live user-data runtime. It mounts
// only for an authenticated user, so it starts the runtime unconditionally.
// Used both as a route layout and directly around the authenticated admin view.
export default function AuthenticatedApp({ children }: { children?: ReactNode }) {
  useEffect(() => {
    startUserData();
  }, []);
  return (
    <Container size="xl" py="xl">
      {children ?? <Outlet />}
    </Container>
  );
}
