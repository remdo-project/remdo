import { useEffect, useSyncExternalStore } from 'react';
import {
  getCurrentUserConfig,
  startUserConfigRuntime,
  subscribeUserConfigRuntime,
} from './stored-user-config';
import type { UserConfigNote } from './contracts';

export function useUserConfigRoot(): UserConfigNote | null {
  const userConfig = useSyncExternalStore(
    subscribeUserConfigRuntime,
    getCurrentUserConfig,
    getCurrentUserConfig,
  );

  useEffect(() => {
    startUserConfigRuntime();
  }, []);

  return userConfig;
}
