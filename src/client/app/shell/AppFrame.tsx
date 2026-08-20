import { Outlet, useMatches } from 'react-router-dom';
import type { UIMatch } from 'react-router-dom';
import type { SessionGateState } from '#client/app/session/client';
import { LogoutProvider, useLogout } from '#client/app/session/useLogout';
import AppHeader from '#client/ui/AppHeader';
import type { AppHeaderAuthState } from '#client/ui/AppHeader';
import headerStyles from '#client/ui/AppHeader.module.css';
import UnsyncedLogoutDialog from '#client/ui/UnsyncedLogoutDialog';
import { DevToolbarLinksSeam } from './DevToolbarSeam';
import styles from './AppFrame.module.css';

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
  return (
    <LogoutProvider>
      <AppFrameContent />
    </LogoutProvider>
  );
}

function AppFrameContent() {
  const matches = useMatches();
  const sessionState = matches.findLast(hasSessionState)?.loaderData.sessionState ?? null;
  const logout = useLogout();

  return (
    <div className={styles.backdrop}>
      <div className={styles.shell}>
        <AppHeader
          authState={resolveHeaderAuthState(sessionState)}
          onLogout={logout.requestLogout}
          trailingNav={<DevToolbarLinksSeam linkClassName={headerStyles.link} />}
        />
        <UnsyncedLogoutDialog
          onCancel={logout.cancelLogout}
          onConfirm={logout.confirmLogout}
          opened={logout.confirmingLoss}
        />
        <Outlet />
      </div>
    </div>
  );
}
