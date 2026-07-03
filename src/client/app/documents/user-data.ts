import { useSyncExternalStore } from 'react';
import { getCachedCurrentUserBootstrap } from './current-user-bootstrap';
import {
  getDocumentSourcesLoading,
  getCurrentUserData,
  subscribeUserDataRuntime,
  getUserDataVersion,
} from './stored-user-data';
import type { UserDataNote } from '#note-sdk';
export {
  resetUserDataRuntime as resetUserData,
  startUserDataRuntime as startUserData,
} from './stored-user-data';

export function useUserData(): UserDataNote {
  useSyncExternalStore(
    subscribeUserDataRuntime,
    getUserDataVersion,
    getUserDataVersion,
  );

  return getCurrentUserData();
}

// The current user's role, reactive to the bootstrap load: the cached bootstrap
// is populated after the user-data runtime starts, so subscribe to that runtime
// and re-read the cache when it changes rather than reading once at first paint.
export function useCurrentUserRole(): string | null {
  useSyncExternalStore(
    subscribeUserDataRuntime,
    getUserDataVersion,
    getUserDataVersion,
  );

  return getCachedCurrentUserBootstrap()?.role ?? null;
}

export function useDocumentSourcesLoading(): boolean {
  return useSyncExternalStore(
    subscribeUserDataRuntime,
    getDocumentSourcesLoading,
    getDocumentSourcesLoading,
  );
}
