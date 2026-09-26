import { z } from 'zod';

const boolish = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .default(false);

const port = z.coerce.number().int().min(0).max(65_535).default(0);
const str = z.string().default('');

export const envSchema = {
  NODE_ENV: str,
  BUILD_REVISION: str,
  DATA_DIR: str,
  HOST: str,
  PUBLIC_HOST: str,
  PORT_BASE: port,
  PORT: port,
  COLLAB_ENABLED: boolish,
  COLLAB_SERVER_PORT: port,
  API_SERVER_PORT: port,
  MCP_SERVER_PORT: port,
  DEV_DOCUMENT_ID: str,
  COLLAB_INTERNAL_SECRET: str,
  // Django's SECRET_KEY; tools/env.defaults.sh supplies the development value.
  AUTH_SECRET: str,
  // Canonical public app URL. Derived in development; required in production.
  APP_ORIGIN: str,
  VITEST_PORT: port,
  CI: boolish,
} as const;

export type EnvKey = keyof typeof envSchema;

// Browser-exposed keys (mirrors the previous spec's client:true flags). Keep in sync with envSchema above.
export const CLIENT_KEY_LIST = ['COLLAB_ENABLED', 'DEV_DOCUMENT_ID', 'BUILD_REVISION'] as const satisfies readonly EnvKey[];
export type ClientKey = (typeof CLIENT_KEY_LIST)[number];
