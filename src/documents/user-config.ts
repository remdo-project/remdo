import { useSyncExternalStore } from 'react';
import {
  getCurrentUserConfig,
  subscribeUserConfigRuntime,
  getUserConfigVersion,
} from './stored-user-config';
import type { UserConfigNote } from './contracts';
export {
  resetUserConfigRuntime as resetUserConfig,
  startUserConfigRuntime as startUserConfig,
} from './stored-user-config';

export function useUserConfig(): UserConfigNote {
  useSyncExternalStore(
    subscribeUserConfigRuntime,
    getUserConfigVersion,
    getUserConfigVersion,
  );

  return getCurrentUserConfig();
}
