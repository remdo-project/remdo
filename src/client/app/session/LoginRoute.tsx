import { Button } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useRevalidator } from 'react-router-dom';
import { createSignInPath } from './post-auth-path';
import { LOGGED_OUT_STATE_KEY } from './useLogout';
import { CONFIRMED_SIGN_OUT_KEY, PENDING_SIGN_OUT_STORAGE_KEY, hasConfirmedSignOut, hasPendingSignOut, revokeServerSession } from './client';

export default function LoginRoute() {
  const location = useLocation();
  const { revalidate } = useRevalidator();

  const [signingIn, setSigningIn] = useState(false);
  const [revokeFailed, setRevokeFailed] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const pending = hasPendingSignOut() && !hasConfirmedSignOut();
  const signInPath = createSignInPath(location.search);

  useEffect(() => {
    const refreshSignOutState = (event: StorageEvent) => {
      if (event.key === PENDING_SIGN_OUT_STORAGE_KEY || event.key === CONFIRMED_SIGN_OUT_KEY) {
        void revalidate();
      }
    };
    globalThis.addEventListener('storage', refreshSignOutState);
    // Confirmation can arrive between rendering and installing the listener.
    void revalidate();
    return () => globalThis.removeEventListener('storage', refreshSignOutState);
  }, [revalidate]);

  useEffect(() => {
    const syncOnline = () => {
      setOnline(navigator.onLine);
      setRevokeFailed(false);
    };
    globalThis.addEventListener('online', syncOnline);
    globalThis.addEventListener('offline', syncOnline);
    return () => {
      globalThis.removeEventListener('online', syncOnline);
      globalThis.removeEventListener('offline', syncOnline);
    };
  }, []);

  // An unfinished logout leaves the session cookie valid, and the session gate
  // refuses to contact the server while the marker is set, so the server-rendered
  // form would redirect straight back here. Finish the sign-out the user already
  // asked for, then hand off to it.
  const signIn = useCallback(async () => {
    setSigningIn(true);
    setRevokeFailed(false);
    try {
      if (await revokeServerSession()) {
        // A full document load, not a client route: the credential form is
        // server-rendered by Django.
        globalThis.location.href = signInPath;
        return;
      }
      setRevokeFailed(true);
      await revalidate();
    } finally {
      setSigningIn(false);
    }
  }, [revalidate, signInPath]);

  const signedOut = (location.state as Record<string, unknown> | null)?.[LOGGED_OUT_STATE_KEY] === true;
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (signedOut) titleRef.current?.focus();
  }, [signedOut]);

  return (
    <main className="remdo-signin remdo-signin-session">
      <section aria-label="About RemDo" className="remdo-signin-story">
        <nav aria-label="Sign in navigation" className="remdo-signin-navigation">
          <a className="remdo-signin-wordmark" href="/">RemDo</a>
          <a className="remdo-signin-back" href="/">← Back to website</a>
        </nav>
        <div className="remdo-signin-story-copy">
          <p className="remdo-signin-story-title">A place for your<br />next thought</p>
          <p>Organize notes and tasks, connect related ideas, and work together in one outline.</p>
        </div>
      </section>
      <section aria-labelledby="remdo-signin-title" className="remdo-signin-panel">
        <nav aria-label="Sign in navigation" className="remdo-signin-navigation remdo-signin-navigation-mobile">
          <a className="remdo-signin-wordmark" href="/">RemDo</a>
          <a className="remdo-signin-back" href="/">← Back to website</a>
        </nav>
        <div className="remdo-signin-content">
          <div className="remdo-signin-intro">
            <h1 id="remdo-signin-title" ref={signedOut ? titleRef : undefined} tabIndex={signedOut ? -1 : undefined}>Sign in</h1>
            <p>Sign in to access your documents.</p>
          </div>
          {pending ? (
            <div className="remdo-signin-session-message" role="status">
              <strong>Sign-out incomplete</strong>
              <p>{online
                ? revokeFailed
                  ? 'The server could not be reached. Try signing in again.'
                  : 'Local data cleared. Signing in finishes signing out first.'
                : 'Local data cleared. Connect to finish signing out.'}</p>
            </div>
          ) : (signedOut || hasConfirmedSignOut()) && (
            <div className="remdo-signin-session-message" role="status">
              <strong>You're signed out</strong>
              <p>This device's local data was cleared.</p>
            </div>
          )}
          {pending ? (
            <Button
              className="remdo-account-button"
              disabled={!online}
              loading={signingIn}
              onClick={() => { void signIn(); }}
              type="button"
            >
              Sign in
            </Button>
          ) : (
            <Button className="remdo-account-button" component="a" href={signInPath}>Sign in</Button>
          )}
        </div>
      </section>
    </main>
  );
}
