import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { apiConfiguration } from '#platform/http/api-client';
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router-dom';
import { isAppShellPath } from '#document-routes';
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
  const signedOut = sessionState?.status === 'unauthenticated';
  const logout = useLogout();
  const navigate = useNavigate();

  useEffect(() => {
    pageElement('[data-app-sign-out]').hidden = signedOut;
  }, [signedOut]);

  // Server-rendered header links to app routes stay inside the running app
  // rather than reloading it.
  useEffect(() => {
    const header = pageElement('.remdo-header');
    const followInApp = (event: MouseEvent) => {
      const link = (event.target as Element).closest('a');
      if (!link || event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const url = new URL(link.href);
      if (url.origin !== globalThis.location.origin || !isAppShellPath(`${url.pathname}${url.search}`)) {
        return;
      }
      event.preventDefault();
      void navigate(`${url.pathname}${url.search}`);
    };
    header.addEventListener('click', followInApp);
    return () => header.removeEventListener('click', followInApp);
  }, [navigate]);

  return (
    <>
      {createPortal(
        <>
          {signedOut && (
            <a className="remdo-header-link" href={createSignInPath(location.search)}>
              Sign in
            </a>
          )}
          <DevToolbarLinksSeam linkClassName="remdo-header-link" />
        </>,
        pageElement('[data-slot="header-session"]'),
      )}
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
