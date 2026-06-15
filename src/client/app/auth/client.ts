import { createAuthClient } from 'better-auth/react';
import { clearStoredCurrentUserBootstrap } from '#client/app/documents/current-user-bootstrap-storage';

const KNOWN_SESSION_STORAGE_KEY = 'remdo-authenticated-session';

export const authClient = createAuthClient({
  basePath: '/api/auth',
});

type SessionResponse = Awaited<ReturnType<typeof authClient.getSession>>;
type CurrentSession = Exclude<SessionResponse['data'], null | undefined>;

type SessionGateState =
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
}

export function forgetAuthenticatedSession() {
  getSessionStorage()?.removeItem(KNOWN_SESSION_STORAGE_KEY);
  clearStoredCurrentUserBootstrap();
}

export function hasRememberedSession() {
  return getSessionStorage()?.getItem(KNOWN_SESSION_STORAGE_KEY) === '1';
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
