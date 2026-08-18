import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { logoutCurrentUser } from './logout';
import { broadcastSignOut } from './logout-broadcast';

export const LOGGED_OUT_STATE_KEY = 'loggedOut';

export function useLogout(): () => Promise<void> {
  const navigate = useNavigate();

  return useCallback(async () => {
    // Peers tear down while this tab is still healthy, before its own storage
    // and session go away.
    broadcastSignOut();
    await logoutCurrentUser();
    await navigate('/', { replace: true, state: { [LOGGED_OUT_STATE_KEY]: true } });
  }, [navigate]);
}
