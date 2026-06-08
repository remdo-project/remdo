import { useSyncExternalStore } from 'react';
import {
  getCurrentUserData,
  subscribeUserDataRuntime,
  getUserDataVersion,
} from './stored-user-data';
import type { UserDataNote } from '@/note-sdk';
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
