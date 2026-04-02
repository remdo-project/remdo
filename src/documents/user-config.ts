import { config } from '#config';
import * as localUserConfig from './memory-user-config';
import * as storedUserConfig from './stored-user-config';

const userConfigApi = config.env.COLLAB_ENABLED ? storedUserConfig : localUserConfig;

export const getUserConfig = userConfigApi.getUserConfig;
