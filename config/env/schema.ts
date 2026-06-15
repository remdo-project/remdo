import { z } from 'zod';

const boolish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
  .default(false);

const port = z.coerce.number().int().min(0).max(65_535).default(0);
const str = z.string().default('');

export const envSchema = {
  NODE_ENV: str,
  DATA_DIR: str,
  HOST: str,
  PORT_BASE: port,
  PORT: port,
  HMR_PORT: port,
  COLLAB_ENABLED: boolish,
  COLLAB_SERVER_PORT: port,
  API_SERVER_PORT: port,
  DEV_DOCUMENT_ID: str,
  YSWEET_CONNECTION_STRING: str,
  YSWEET_AUTH_KEY: str,
  YSWEET_SERVER_TOKEN: str,
  AUTH_SECRET: str,
  ADMIN_SECRET: str,
  APP_PUBLIC_URL: str,
  AUTH_URL: str,
  LINKABLE_REMDO_SERVERS_JSON: str,
  REMDO_DEV_OAUTH_CLIENT_ID: str,
  REMDO_DEV_OAUTH_CLIENT_SECRET: str,
  REMDO_DEV_HOME_ORIGIN: str,
  ALLOW_SIGNUP: boolish,
  PREVIEW_PORT: port,
  VITEST_PORT: port,
  VITEST_PREVIEW_PORT: port,
  PLAYWRIGHT_UI_PORT: port,
  CI: boolish,
  VITEST_PREVIEW: boolish,
} as const;

export type EnvKey = keyof typeof envSchema;

export const CLIENT_KEYS = new Set<EnvKey>(['COLLAB_ENABLED', 'DEV_DOCUMENT_ID']);
