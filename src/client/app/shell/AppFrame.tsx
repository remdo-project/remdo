import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { registerSW } from 'virtual:pwa-register';
import { config } from '#config';
import { useQuery } from '@tanstack/react-query';
import { apiConfiguration } from '#platform/http/api-client';
import { Link, Outlet, useLocation, useMatches } from 'react-router-dom';
import type { UIMatch } from 'react-router-dom';
import type { SessionGateState } from '#client/app/session/client';
import { LogoutProvider, useLogout } from '#client/app/session/useLogout';
import { createSignInPath } from '#client/app/session/post-auth-path';
import BuildStatus from '#client/ui/BuildStatus';
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

function pageElement(selector: string): HTMLElement {
  return document.querySelector<HTMLElement>(selector)!;
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
  const signedIn = sessionState?.status === 'authenticated' || sessionState?.status === 'offline-remembered';
  const signedOut = sessionState?.status === 'unauthenticated';
  const connectionUnavailable = sessionState?.status === 'offline-unavailable';
  const logout = useLogout();
  const authenticated = sessionState?.status === 'authenticated';

  // Offline entry is only for a device with a signed-in account; confirmed
  // logout removes it again.
  useEffect(() => {
    if (authenticated && config.isProd) {
      registerSW({ immediate: true });
    }
  }, [authenticated]);
  const headerLinks = connectionUnavailable ? null : (
    <>
      <a className="remdo-header-link" href="/about/">About</a>
      {signedIn && (
        <Link className="remdo-header-link" to="/sign-out">
          Logout
        </Link>
      )}
      {signedOut && (
        <a className="remdo-header-link" href={createSignInPath(location.search)}>
          Sign in
        </a>
      )}
      <DevToolbarLinksSeam linkClassName="remdo-header-link" />
    </>
  );

  return (
    <>
      {createPortal(headerLinks, pageElement('[data-slot="header-links"]'))}
      {createPortal(
        <BuildStatus serverRevision={configuration?.buildRevision ?? ''} />,
        pageElement('[data-slot="footer-status"]'),
      )}
      <UnsyncedLogoutDialog
        onCancel={logout.cancelLogout}
        onConfirm={logout.confirmLogout}
        opened={logout.confirmingLoss}
      />
      {logout.signingOut ? <div role="status">Signing out…</div> : <Outlet />}
    </>
  );
}
