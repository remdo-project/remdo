import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { clearStoredCurrentUserBootstrap } from '#client/app/user-data/current-user-bootstrap-storage';

const KNOWN_SESSION_STORAGE_KEY = 'remdo-authenticated-session';
export const PENDING_SIGN_OUT_STORAGE_KEY = 'remdo-pending-sign-out';
const PENDING_SIGN_OUT_ORIGIN_KEY = 'remdo-pending-sign-out-origin';
const PENDING_SIGN_OUT_STORAGE_VALUE = '1';
const SERVER_SIGN_OUT_TIMEOUT_MS = 1500;

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

function getTabStorage(): Storage | null {
  try {
    return globalThis.sessionStorage;
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
 * this device signed out until a successful sign-in, including after the server
 * has confirmed the revoke.
 */
export function rememberPendingSignOut() {
  // Mark this tab first so its own peer-sign-out poll does not treat the write
  // as another tab's broadcast. Session storage is best-effort: a quota or
  // permission failure must not skip the shared marker or abort logout.
  try {
    getTabStorage()?.setItem(PENDING_SIGN_OUT_ORIGIN_KEY, PENDING_SIGN_OUT_STORAGE_VALUE);
  } catch {
    // Originator mark is optional; peers still see the shared localStorage key.
  }
  getSessionStorage()?.setItem(PENDING_SIGN_OUT_STORAGE_KEY, PENDING_SIGN_OUT_STORAGE_VALUE);
}

export function forgetPendingSignOut() {
  getSessionStorage()?.removeItem(PENDING_SIGN_OUT_STORAGE_KEY);
  getTabStorage()?.removeItem(PENDING_SIGN_OUT_ORIGIN_KEY);
}

export function hasPendingSignOut() {
  return getSessionStorage()?.getItem(PENDING_SIGN_OUT_STORAGE_KEY) === PENDING_SIGN_OUT_STORAGE_VALUE;
}

export function originatedPendingSignOut() {
  return getTabStorage()?.getItem(PENDING_SIGN_OUT_ORIGIN_KEY) === PENDING_SIGN_OUT_STORAGE_VALUE;
}

export function isPendingSignOutStorageEvent(event: StorageEvent): boolean {
  return event.key === PENDING_SIGN_OUT_STORAGE_KEY
    && event.newValue === PENDING_SIGN_OUT_STORAGE_VALUE;
}

/**
 * Revoke the server session. The pending marker stays until a successful
 * sign-in; a `{ error }` result is not confirmation.
 */
export async function revokeServerSession(): Promise<void> {
  try {
    const result = await Promise.race([
      authClient.signOut(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Server sign-out timed out.')), SERVER_SIGN_OUT_TIMEOUT_MS);
      }),
    ]);
    if (result.error) {
      throw result.error;
    }
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
