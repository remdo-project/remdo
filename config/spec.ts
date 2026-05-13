import type { EnvSpec } from './_internal/env/parse';
import { defineEnvSpec } from './_internal/env/parse';

// This schema defines parse-time types and raw fallbacks. Some effective runtime
// defaults are derived later in env loading or shell defaults.
export const envSpec = defineEnvSpec(
  {
    NODE_ENV: { default: '' },
    DATA_DIR: { default: '' },
    HOST: { default: '' },
    PORT: { default: 0 },
    HMR_PORT: { default: 0 },
    COLLAB_ENABLED: { default: false, client: true },
    COLLAB_SERVER_PORT: { default: 0 },
    REMDO_API_PORT: { default: 0 },
    COLLAB_CLIENT_PORT: { default: 0, client: true },
    COLLAB_DOCUMENT_ID: { default: '', client: true },
    YSWEET_CONNECTION_STRING: { default: '' },
    AUTH_SECRET: { default: '' },
    ADMIN_SECRET: { default: '' },
    APP_PUBLIC_URL: { default: '' },
    // Parse fallback only; tools/env.defaults.sh sets true outside production.
    ALLOW_SIGNUP: { default: false },
    PREVIEW_PORT: { default: 0 },
    VITEST_PORT: { default: 0 },
    VITEST_PREVIEW_PORT: { default: 0 },
    PLAYWRIGHT_UI_PORT: { default: 0 },
    PLAYWRIGHT_WEB_PORT: { default: 0 },
    PLAYWRIGHT_HMR_PORT: { default: 0 },
    E2E_PORT: { default: 0 },
    E2E_HMR_PORT: { default: 0 },
    E2E_COLLAB_SERVER_PORT: { default: 0 },
    E2E_COLLAB_CLIENT_PORT: { default: 0 },
    E2E_REMDO_API_PORT: { default: 0 },
    E2E_YSWEET_CONNECTION_STRING: { default: '' },
    CI: { default: false },
    VITEST_PREVIEW: { default: false },
  } satisfies EnvSpec,
);
