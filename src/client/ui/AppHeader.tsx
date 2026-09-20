import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { APP_TITLE } from './navigation-label';

export type AppHeaderAuthState =
  | { status: 'authenticated'; isAdmin: boolean }
  | { status: 'offline-remembered' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export interface AppHeaderProps {
  authState: AppHeaderAuthState;
  onLogout: () => void;
  signInHref: string;
  trailingNav?: ReactNode;
}

export default function AppHeader({ authState, onLogout, signInHref, trailingNav }: AppHeaderProps) {
  const hasAppAccess = authState.status === 'authenticated'
    || authState.status === 'offline-remembered';

  return (
    <header className="remdo-header">
      <div className="remdo-header-inner">
        <Link aria-label={`${APP_TITLE} home`} className="remdo-header-brand-link" to="/">
          <span aria-hidden="true" className="remdo-header-brand-icon" />
          <span className="remdo-brand-name">{APP_TITLE}</span>
        </Link>

        <nav aria-label="Primary" className="remdo-header-navigation">
          <div className="remdo-header-links">
            {authState.status !== 'unavailable' && (
              <a className="remdo-header-link" href="/about/">
                About
              </a>
            )}
            {hasAppAccess && (
              <NavLink className="remdo-header-link" to="/sharing">
                Sharing
              </NavLink>
            )}
            {authState.status === 'authenticated' && authState.isAdmin && (
              <a className="remdo-header-link" href="/admin/">
                Admin
              </a>
            )}
            {hasAppAccess && (
              <button className="remdo-header-link" type="button" onClick={onLogout}>
                Logout
              </button>
            )}
            {authState.status === 'unauthenticated' && (
              <a className="remdo-header-link" href={signInHref}>
                Sign in
              </a>
            )}
            {trailingNav}
          </div>
        </nav>
      </div>
    </header>
  );
}
