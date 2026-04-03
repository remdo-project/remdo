import { useSyncExternalStore } from 'react';
import {
  getCurrentUserConfig,
  subscribeUserConfigRuntime,
  getUserConfigVersion,
  startUserConfigRuntime,
} from './stored-user-config';
import type { UserConfigNote } from './contracts';

export function startUserConfig(): void {
  startUserConfigRuntime();
}

export function useUserConfig(): UserConfigNote {
  useSyncExternalStore(
    subscribeUserConfigRuntime,
    getUserConfigVersion,
    getUserConfigVersion,
  );

  return getCurrentUserConfig();
}
