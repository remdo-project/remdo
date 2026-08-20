import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { clearStoredCurrentUserBootstrap } from '#client/app/user-data/current-user-bootstrap-storage';

const KNOWN_SESSION_STORAGE_KEY = 'remdo-authenticated-session';
export const PENDING_SIGN_OUT_STORAGE_KEY = 'remdo-pending-sign-out';
const PENDING_SIGN_OUT_ORIGIN_KEY = 'remdo-pending-sign-out-origin';
const CONFIRMED_SIGN_OUT_KEY = 'remdo-sign-out-confirmed';
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

function withTabStorage(mutate: (storage: Storage) => void): void {
  try {
    const storage = getTabStorage();
    if (storage) {
      mutate(storage);
    }
  } catch {
    // Tab-scoped marks are best-effort; quota or permission failures must not
    // abort logout, sign-in, or the shared pending marker.
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
 * this device signed out until a successful sign-in. A confirmed revoke is
 * remembered per tab so later loaders do not call sign-out again.
 */
export function rememberPendingSignOut() {
  // Mark this tab first so its own peer-sign-out poll does not treat the write
  // as another tab's broadcast. A new logout is not yet confirmed.
  withTabStorage((storage) => {
    storage.setItem(PENDING_SIGN_OUT_ORIGIN_KEY, PENDING_SIGN_OUT_STORAGE_VALUE);
    storage.removeItem(CONFIRMED_SIGN_OUT_KEY);
  });
  getSessionStorage()?.setItem(PENDING_SIGN_OUT_STORAGE_KEY, PENDING_SIGN_OUT_STORAGE_VALUE);
}

export function forgetPendingSignOut() {
  getSessionStorage()?.removeItem(PENDING_SIGN_OUT_STORAGE_KEY);
  withTabStorage((storage) => {
    storage.removeItem(PENDING_SIGN_OUT_ORIGIN_KEY);
    storage.removeItem(CONFIRMED_SIGN_OUT_KEY);
  });
}

export function hasPendingSignOut() {
  return getSessionStorage()?.getItem(PENDING_SIGN_OUT_STORAGE_KEY) === PENDING_SIGN_OUT_STORAGE_VALUE;
}

export function originatedPendingSignOut() {
  return getTabStorage()?.getItem(PENDING_SIGN_OUT_ORIGIN_KEY) === PENDING_SIGN_OUT_STORAGE_VALUE;
}

function rememberConfirmedSignOut() {
  withTabStorage((storage) => {
    storage.setItem(CONFIRMED_SIGN_OUT_KEY, PENDING_SIGN_OUT_STORAGE_VALUE);
  });
}

function hasConfirmedSignOut() {
  return getTabStorage()?.getItem(CONFIRMED_SIGN_OUT_KEY) === PENDING_SIGN_OUT_STORAGE_VALUE;
}

export function isPendingSignOutStorageEvent(event: StorageEvent): boolean {
  return event.key === PENDING_SIGN_OUT_STORAGE_KEY
    && event.newValue === PENDING_SIGN_OUT_STORAGE_VALUE;
}

/**
 * Revoke the server session. A `{ error }` result is not confirmation. The
 * shared pending marker stays until sign-in so a still-visible cookie cannot
 * resume the session; this tab stops retrying once the server confirms.
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
    rememberConfirmedSignOut();
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
    if (!hasConfirmedSignOut()) {
      await revokeServerSession();
    }
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
