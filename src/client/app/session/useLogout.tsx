import type { ReactNode } from 'react';
import { createContext, use, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resetUserData } from '#client/app/user-data/user-data';
import { hasUnsyncedLocalChanges } from '#collaboration/unsynced-local-changes';
import { forgetAuthenticatedSession } from './client';
import { logoutCurrentUser } from './logout';
import { broadcastSignOut, subscribeToSignOut } from './logout-broadcast';

export const LOGGED_OUT_STATE_KEY = 'loggedOut';

export interface LogoutController {
  /** Whether logout is waiting for the user to accept losing local edits. */
  confirmingLoss: boolean;
  /** Starts logout, or asks for confirmation when local edits would be lost. */
  requestLogout: () => void;
  confirmLogout: () => void;
  cancelLogout: () => void;
}

const LogoutContext = createContext<LogoutController | null>(null);

/**
 * Logout has one owner. The confirm lives in the controller's state and renders
 * in one place, so a caller cannot reach a confirm that nothing displays.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Safe: hook reads context without holding component state.
export function useLogout(): LogoutController {
  const controller = use(LogoutContext);
  if (!controller) {
    throw new Error('Logout context is missing. Wrap the route tree in <LogoutProvider>.');
  }
  return controller;
}

function useLogoutController(): LogoutController {
  const navigate = useNavigate();
  const [confirmingLoss, setConfirmingLoss] = useState(false);

  const signOut = useCallback(async () => {
    // Peers tear down while this tab is still healthy, before its own storage
    // and session go away.
    broadcastSignOut();
    await logoutCurrentUser();
    await navigate('/', { replace: true, state: { [LOGGED_OUT_STATE_KEY]: true } });
  }, [navigate]);

  const requestLogout = useCallback(() => {
    // Work the server has acknowledged survives signing back in, so it gets no
    // dialog; suppressing it there is what keeps the warning meaningful.
    if (hasUnsyncedLocalChanges()) {
      setConfirmingLoss(true);
      return;
    }
    void signOut();
  }, [signOut]);

  const confirmLogout = useCallback(() => {
    setConfirmingLoss(false);
    void signOut();
  }, [signOut]);

  const cancelLogout = useCallback(() => {
    setConfirmingLoss(false);
  }, []);

  useEffect(() => subscribeToSignOut(() => {
    // Another tab is clearing this origin's storage. Tear the runtime down
    // before a further edit hits a provider whose database is already going away.
    resetUserData();
    forgetAuthenticatedSession();
    void navigate('/', { replace: true });
  }), [navigate]);

  return { confirmingLoss, requestLogout, confirmLogout, cancelLogout };
}

export function LogoutProvider({ children }: { children: ReactNode }) {
  const controller = useLogoutController();
  return <LogoutContext value={controller}>{children}</LogoutContext>;
}
