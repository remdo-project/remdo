import { config as clientConfig } from './client';

export const config = {
  ...clientConfig,
  dev: clientConfig.isDev,
} as const;
