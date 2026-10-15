import type { ReactNode } from 'react';
import { Outlet, useLoaderData, useOutletContext } from 'react-router-dom';
import UserDataRuntimeBoundary from '#client/app/user-data/UserDataRuntimeBoundary';
import { getCachedCurrentUserBootstrap } from '#client/app/user-data/current-user-bootstrap';
import type { SessionGateState } from '#client/app/session/client';
import { SharedDocumentsButton } from './SharedDocumentsButton';

// The authenticated app boundary starts the live user-data runtime. It mounts
// only for an authenticated user, so it starts the runtime unconditionally.
export default function AuthenticatedApp({ children }: { children?: ReactNode }) {
  const sharedDocumentsHost = useOutletContext<HTMLElement | null>();
  const { sessionState } = useLoaderData<{ sessionState: SessionGateState }>();
  const userId = sessionState.status === 'authenticated'
    ? String(sessionState.session.user.id)
    : getCachedCurrentUserBootstrap()!.userId;
  return (
    <UserDataRuntimeBoundary key={userId} userId={userId}>
      <SharedDocumentsButton host={sharedDocumentsHost} />
      {children ?? <Outlet />}
    </UserDataRuntimeBoundary>
  );
}
