import { Outlet, useMatches } from 'react-router-dom';
import type { UIMatch } from 'react-router-dom';
import type { SessionGateState } from './auth/client';
import AppHeader from '#client/ui/AppHeader';
import type { AppHeaderAuthState } from '#client/ui/AppHeader';

interface SessionRouteData {
  sessionState: SessionGateState;
}

function hasSessionState(
  match: UIMatch,
): match is UIMatch & { loaderData: SessionRouteData } {
  const { loaderData } = match;
  return typeof loaderData === 'object'
    && loaderData !== null
    && 'sessionState' in loaderData;
}

function resolveHeaderAuthState(sessionState: SessionGateState | null): AppHeaderAuthState {
  if (sessionState?.status === 'authenticated') {
    return {
      status: 'authenticated',
      isAdmin: sessionState.session.user.role === 'admin',
    };
  }
  if (sessionState?.status === 'offline-remembered') {
    return { status: 'offline-remembered' };
  }
  if (sessionState?.status === 'unauthenticated') {
    return { status: 'unauthenticated' };
  }
  return { status: 'unavailable' };
}

export default function AppFrame() {
  const matches = useMatches();
  const sessionState = matches.findLast(hasSessionState)?.loaderData.sessionState ?? null;

  return (
    <>
      <AppHeader authState={resolveHeaderAuthState(sessionState)} />
      <Outlet />
    </>
  );
}
