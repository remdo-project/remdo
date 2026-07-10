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

// Whether this server is public (open-signup). Reactive to the bootstrap load.
// A public server is source-only and refuses to link out, so the UI hides the
// link action when this is true.
export function useCurrentUserPublicServer(): boolean {
  useSyncExternalStore(
    subscribeUserDataRuntime,
    getUserDataVersion,
    getUserDataVersion,
  );

  return getCachedCurrentUserBootstrap()?.publicServer ?? false;
}

export function useDocumentSourcesLoading(): boolean {
  return useSyncExternalStore(
    subscribeUserDataRuntime,
    getDocumentSourcesLoading,
    getDocumentSourcesLoading,
  );
}
