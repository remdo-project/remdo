import { getSession, signOut } from './session-http';
import { clearStoredCurrentUserBootstrap } from '#client/app/user-data/current-user-bootstrap-storage';

const KNOWN_SESSION_STORAGE_KEY = 'remdo-authenticated-session';
export const PENDING_SIGN_OUT_STORAGE_KEY = 'remdo-pending-sign-out';
const PENDING_SIGN_OUT_ORIGIN_KEY = 'remdo-pending-sign-out-origin';
export const CONFIRMED_SIGN_OUT_KEY = 'remdo-sign-out-confirmed';
const PENDING_SIGN_OUT_STORAGE_VALUE = '1';
const SERVER_SIGN_OUT_TIMEOUT_MS = 1500;

type CurrentSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

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

function withSessionStorage(mutate: (storage: Storage) => void): void {
  try {
    const storage = getSessionStorage();
    if (storage) {
      mutate(storage);
    }
  } catch {
    // A quota or permission failure must not strand the shell mid-logout: the
    // server session is revoked next, and peers fall back to their own checks.
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

function newPendingSignOutGeneration(): string {
  const randomUUID = globalThis.crypto.randomUUID;
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto);
  }
  // `randomUUID` is secure-context-only; development may serve http://<host>.
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

export function rememberAuthenticatedSession() {
  withSessionStorage((storage) => {
    storage.setItem(KNOWN_SESSION_STORAGE_KEY, '1');
  });
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
 * the app locked until a successful sign-in. Server confirmation is shared
 * across tabs and survives reopening the app.
 */
let volatilePendingSignOut: string | null = null;
let volatileConfirmedSignOut: string | null = null;

export function rememberPendingSignOut() {
  // Mark this tab first so its own peer-sign-out poll does not treat the write
  // as another tab's broadcast. Keep an existing generation so a failed revoke
  // does not look like a new logout to other tabs.
  withTabStorage((storage) => {
    storage.setItem(PENDING_SIGN_OUT_ORIGIN_KEY, PENDING_SIGN_OUT_STORAGE_VALUE);
  });
  const generation = newPendingSignOutGeneration();
  withSessionStorage((storage) => {
    if (!storage.getItem(PENDING_SIGN_OUT_STORAGE_KEY)) {
      storage.setItem(PENDING_SIGN_OUT_STORAGE_KEY, generation);
    }
  });
  // Storage that refuses the write would otherwise leave no generation at all,
  // and revocation treats a missing one as already settled — so an unwritable
  // marker would skip the logout request and let the next revalidation restore
  // the session. This copy keeps the logout in force for the current document;
  // it cannot survive a reload, which is what the durable marker is for.
  if (!pendingSignOutGeneration()) {
    volatilePendingSignOut = generation;
  }
}

export function forgetPendingSignOut() {
  volatilePendingSignOut = null;
  volatileConfirmedSignOut = null;
  getSessionStorage()?.removeItem(PENDING_SIGN_OUT_STORAGE_KEY);
  getSessionStorage()?.removeItem(CONFIRMED_SIGN_OUT_KEY);
  withTabStorage((storage) => {
    storage.removeItem(PENDING_SIGN_OUT_ORIGIN_KEY);
  });
}

function pendingSignOutGeneration(): string | null {
  const value = getSessionStorage()?.getItem(PENDING_SIGN_OUT_STORAGE_KEY);
  return value && value.length > 0 ? value : volatilePendingSignOut;
}

export function hasPendingSignOut() {
  return pendingSignOutGeneration() !== null;
}

export function originatedPendingSignOut() {
  return getTabStorage()?.getItem(PENDING_SIGN_OUT_ORIGIN_KEY) === PENDING_SIGN_OUT_STORAGE_VALUE;
}

export function hasConfirmedSignOut() {
  const generation = pendingSignOutGeneration();
  if (generation === null) {
    return false;
  }
  return getSessionStorage()?.getItem(CONFIRMED_SIGN_OUT_KEY) === generation
    || volatileConfirmedSignOut === generation;
}

export function isPendingSignOutStorageEvent(event: StorageEvent): boolean {
  return event.key === PENDING_SIGN_OUT_STORAGE_KEY
    && typeof event.newValue === 'string'
    && event.newValue.length > 0;
}

/**
 * Revoke only on an explicit logout action; route loads never retry it. Reports
 * whether the sign-out is now settled, so a caller offering sign-in can tell an
 * unreachable server from a completed revocation instead of silently continuing.
 */
export async function revokeServerSession(): Promise<boolean> {
  const generation = pendingSignOutGeneration();
  if (!generation || hasConfirmedSignOut()) return true;
  if (!navigator.onLine) return false;
  try {
    await Promise.race([
      signOut(AbortSignal.timeout(SERVER_SIGN_OUT_TIMEOUT_MS), () => {
        if (pendingSignOutGeneration() !== generation) {
          throw new DOMException('Sign-out superseded.', 'AbortError');
        }
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Server sign-out timed out.')), SERVER_SIGN_OUT_TIMEOUT_MS);
      }),
    ]);
    // A newer sign-in or logout supersedes this request's local result.
    if (pendingSignOutGeneration() === generation) {
      // Storage that refused the pending marker refuses this too, so record the
      // confirmation in memory as well; otherwise the revoked session would keep
      // reporting an unfinished sign-out.
      volatileConfirmedSignOut = generation;
      withSessionStorage((storage) => {
        storage.setItem(CONFIRMED_SIGN_OUT_KEY, generation);
      });
    }
    return true;
  } catch {
    // Keep the existing marker; a failed request must not recreate it after sign-in.
    return false;
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
    return { status: 'unauthenticated' };
  }

  try {
    const session = await getSession();
    if (session) {
      rememberAuthenticatedSession();
      return {
        status: 'authenticated',
        session,
      };
    }

    forgetAuthenticatedSession();
    return { status: 'unauthenticated' };
  } catch (error) {
    const status = readAuthErrorStatus(error);
    if (status === 401 || status === 403) {
      forgetAuthenticatedSession();
      return { status: 'unauthenticated' };
    }
    if (status !== null) {
      return resolveUnavailableSessionGateState();
    }
    if (!navigator.onLine || isLikelyFetchUnavailableError(error)) {
      return resolveUnavailableSessionGateState();
    }
    throw error;
  }
}
