import { z } from 'zod';

const boolish = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
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
  // Private key passed to Y-Sweet so it can verify document client tokens.
  YSWEET_AUTH_KEY: str,
  // Y-Sweet server token used by RemDo API and backup tools.
  YSWEET_SERVER_TOKEN: str,
  // Better Auth application secret.
  AUTH_SECRET: str,
  // Operator secret for admin provisioning actions.
  ADMIN_SECRET: str,
  // Canonical public app URL for server-mode auth and gateway behavior.
  APP_PUBLIC_URL: str,
  // Canonical auth URL. tools/env.defaults.sh derives this for local dev modes.
  AUTH_URL: str,
  // Stable dev-only OAuth client used by the Docker home server to link the dev source server.
  REMDO_DEV_OAUTH_CLIENT_ID: str,
  REMDO_DEV_OAUTH_CLIENT_SECRET: str,
  REMDO_DEV_HOME_ORIGIN: str,
  // Product signup policy. tools/env.defaults.sh sets true outside production.
  ALLOW_SIGNUP: boolish,
  PREVIEW_PORT: port,
  VITEST_PORT: port,
  VITEST_PREVIEW_PORT: port,
  PLAYWRIGHT_UI_PORT: port,
  CI: boolish,
  VITEST_PREVIEW: boolish,
} as const;

export type EnvKey = keyof typeof envSchema;

// Browser-exposed keys (mirrors the previous spec's client:true flags). Keep in sync with envSchema above.
export const CLIENT_KEY_LIST = ['COLLAB_ENABLED', 'DEV_DOCUMENT_ID'] as const satisfies readonly EnvKey[];
export type ClientKey = (typeof CLIENT_KEY_LIST)[number];
