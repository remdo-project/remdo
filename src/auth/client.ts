import { createAuthClient } from 'better-auth/react';

const KNOWN_SESSION_STORAGE_KEY = 'remdo-authenticated-session';

export const authClient = createAuthClient({
  basePath: '/api/auth',
});

type SessionResponse = Awaited<ReturnType<typeof authClient.getSession>>;
export type CurrentSession = Exclude<SessionResponse['data'], null | undefined>;

export type SessionGateState =
  | { status: 'authenticated'; session: CurrentSession }
  | { status: 'offline-fallback' }
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
}

function hasRememberedSession() {
  return getSessionStorage()?.getItem(KNOWN_SESSION_STORAGE_KEY) === '1';
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

    forgetAuthenticatedSession();
    return { status: 'unauthenticated' };
  } catch (error) {
    if (!navigator.onLine && hasRememberedSession()) {
      return { status: 'offline-fallback' };
    }
    throw error;
  }
}
