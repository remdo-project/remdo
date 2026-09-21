import { useQuery } from '@tanstack/react-query';
import { apiConfiguration } from '#platform/http/api-client';
import { Outlet, useLocation, useMatches } from 'react-router-dom';
import type { UIMatch } from 'react-router-dom';
import type { SessionGateState } from '#client/app/session/client';
import { LogoutProvider, useLogout } from '#client/app/session/useLogout';
import { createSignInPath } from '#client/app/session/post-auth-path';
import AppHeader from '#client/ui/AppHeader';
import AppFooter from '#client/ui/AppFooter';
import type { AppHeaderAuthState } from '#client/ui/AppHeader';
import UnsyncedLogoutDialog from '#client/ui/UnsyncedLogoutDialog';
import { DevToolbarLinksSeam } from './DevToolbarSeam';

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
      isAdmin: sessionState.session.user.is_staff,
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
  return (
    <LogoutProvider>
      <AppFrameContent />
    </LogoutProvider>
  );
}

function AppFrameContent() {
  const { data: configuration } = useQuery(apiConfiguration.query, apiConfiguration.client);
  const matches = useMatches();
  const location = useLocation();
  const sessionState = matches.findLast(hasSessionState)?.loaderData.sessionState ?? null;
  const logout = useLogout();

  return (
    <div className="remdo-backdrop">
      <div className="remdo-shell">
        <AppHeader
          authState={logout.signingOut ? { status: 'unavailable' } : resolveHeaderAuthState(sessionState)}
          onLogout={logout.requestLogout}
          signInHref={createSignInPath(location.search)}
          trailingNav={<DevToolbarLinksSeam linkClassName="remdo-header-link" />}
        />
        <UnsyncedLogoutDialog
          onCancel={logout.cancelLogout}
          onConfirm={logout.confirmLogout}
          opened={logout.confirmingLoss}
        />
        {logout.signingOut ? <div role="status">Signing out…</div> : <Outlet />}
        <AppFooter serverRevision={configuration?.buildRevision ?? ''} />
      </div>
    </div>
  );
}
