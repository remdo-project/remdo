import { Outlet, useMatches } from 'react-router-dom';
import type { UIMatch } from 'react-router-dom';
import type { SessionGateState } from '#client/app/session/client';
import AppHeader from '#client/ui/AppHeader';
import type { AppHeaderAuthState } from '#client/ui/AppHeader';
import headerStyles from '#client/ui/AppHeader.module.css';
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
  const matches = useMatches();
  const sessionState = matches.findLast(hasSessionState)?.loaderData.sessionState ?? null;

  return (
    <div className={styles.backdrop}>
      <div className={styles.shell}>
        <AppHeader
          authState={resolveHeaderAuthState(sessionState)}
          trailingNav={<DevToolbarLinksSeam linkClassName={headerStyles.link} />}
        />
        <Outlet />
      </div>
    </div>
  );
}
