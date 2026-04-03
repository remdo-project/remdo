import { useEffect, useSyncExternalStore } from 'react';
import { config } from '#config';
import * as localUserConfig from './memory-user-config';
import * as storedUserConfig from './stored-user-config';
import type { UserConfigNote } from './contracts';

const userConfigApi = config.env.COLLAB_ENABLED ? storedUserConfig : localUserConfig;

export function useUserConfigRoot(): UserConfigNote | null {
  const userConfig = useSyncExternalStore(
    userConfigApi.subscribeUserConfigRuntime,
    userConfigApi.getCurrentUserConfig,
    userConfigApi.getCurrentUserConfig,
  );

  useEffect(() => {
    userConfigApi.startUserConfigRuntime();
  }, []);

  return userConfig;
}
