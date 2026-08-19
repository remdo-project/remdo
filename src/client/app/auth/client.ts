import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { clearStoredCurrentUserBootstrap } from '#client/app/documents/current-user-bootstrap-storage';

const KNOWN_SESSION_STORAGE_KEY = 'remdo-authenticated-session';
const PENDING_SIGN_OUT_STORAGE_KEY = 'remdo-pending-sign-out';

export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [adminClient()],
});

type SessionResponse = Awaited<ReturnType<typeof authClient.getSession>>;
type CurrentSession = Exclude<SessionResponse['data'], null | undefined>;

export type SessionGateState =
  | { status: 'authenticated'; session: CurrentSession }
  | { status: 'offline-remembered' }
  | { status: 'offline-unavailable' }
  | { status: 'unauthenticated' };

function getSessionStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function rememberAuthenticatedSession() {
  getSessionStorage()?.setItem(KNOWN_SESSION_STORAGE_KEY, '1');
  // A fresh session supersedes any sign-out this device never delivered;
  // replaying it later would revoke the new session instead.
  forgetPendingSignOut();
}

export function forgetAuthenticatedSession() {
  getSessionStorage()?.removeItem(KNOWN_SESSION_STORAGE_KEY);
  clearStoredCurrentUserBootstrap();
}

export function hasRememberedSession() {
  return getSessionStorage()?.getItem(KNOWN_SESSION_STORAGE_KEY) === '1';
}

/**
 * A sign-out that could not reach the server leaves the session cookie valid, so
 * the next reachable revalidation would sign the user back in. The marker keeps
 * this device signed out until the server confirms, and is cleared by any
 * successful sign-in.
 */
export function rememberPendingSignOut() {
  getSessionStorage()?.setItem(PENDING_SIGN_OUT_STORAGE_KEY, '1');
}

export function forgetPendingSignOut() {
  getSessionStorage()?.removeItem(PENDING_SIGN_OUT_STORAGE_KEY);
}

export function hasPendingSignOut() {
  return getSessionStorage()?.getItem(PENDING_SIGN_OUT_STORAGE_KEY) === '1';
}

/**
 * Revoke the server session. The pending marker stays until the server confirms;
 * a `{ error }` result is not confirmation.
 */
export async function revokeServerSession(): Promise<void> {
  try {
    const result = await authClient.signOut();
    if (result.error) {
      throw result.error;
    }
    forgetPendingSignOut();
  } catch {
    rememberPendingSignOut();
  }
}

export function isLikelyFetchUnavailableError(error: unknown): boolean {
  // Browser fetch failures are exposed as TypeError, but message text varies
  // across engines, so callers must keep this predicate scoped to fetch paths.
  return error instanceof TypeError;
}

function resolveUnavailableSessionGateState(): SessionGateState {
  return hasRememberedSession()
    ? { status: 'offline-remembered' }
    : { status: 'offline-unavailable' };
}

function readAuthErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }
  const status = (error).status;
  return typeof status === 'number' ? status : null;
}

export async function resolveSessionGateState(): Promise<SessionGateState> {
  if (hasPendingSignOut()) {
    await revokeServerSession();
    return { status: 'unauthenticated' };
  }

  try {
    const result = await authClient.getSession();
    if (result.data) {
      rememberAuthenticatedSession();
      return {
        status: 'authenticated',
        session: result.data,
      };
    }

    if (result.error) {
      const status = readAuthErrorStatus(result.error);
      if (status === 401 || status === 403) {
        forgetAuthenticatedSession();
        return { status: 'unauthenticated' };
      }
      return resolveUnavailableSessionGateState();
    }

    if (!navigator.onLine) {
      return resolveUnavailableSessionGateState();
    }

    forgetAuthenticatedSession();
    return { status: 'unauthenticated' };
  } catch (error) {
    if (!navigator.onLine || isLikelyFetchUnavailableError(error)) {
      return resolveUnavailableSessionGateState();
    }
    throw error;
  }
}
