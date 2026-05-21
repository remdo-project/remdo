import { createAuthClient } from 'better-auth/react';
import { clearStoredCurrentUserBootstrap } from '@/documents/current-user-bootstrap-storage';

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
