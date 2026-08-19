import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasUnsyncedLocalChanges } from '#collaboration/session';
import { logoutCurrentUser } from './logout';
import { broadcastSignOut } from './logout-broadcast';

export const LOGGED_OUT_STATE_KEY = 'loggedOut';

export interface LogoutController {
  /** Whether logout is waiting for the user to accept losing local edits. */
  confirmingLoss: boolean;
  /** Starts logout, or asks for confirmation when local edits would be lost. */
  requestLogout: () => void;
  confirmLogout: () => void;
  cancelLogout: () => void;
}

export function useLogout(): LogoutController {
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

  return { confirmingLoss, requestLogout, confirmLogout, cancelLogout };
}
