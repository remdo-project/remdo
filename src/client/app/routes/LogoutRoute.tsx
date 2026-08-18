import { useEffect, useRef } from 'react';
import { useLogout } from '#client/app/auth/useLogout';

/**
 * `/logout` stays reachable because it is bookmarkable and typed by hand, but it
 * renders nothing: logout is local and bounded, so there is no progress to show
 * and no failure to report.
 */
export default function LogoutRoute() {
  const logout = useLogout();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    void logout();
  }, [logout]);

  return null;
}
