import type { EnvSpec } from './_internal/env/parse';
import { defineEnvSpec } from './_internal/env/parse';

// This schema defines parse-time types and raw fallbacks. Some effective runtime
// defaults are derived later in env loading or shell defaults.
export const envSpec = defineEnvSpec(
  {
    NODE_ENV: { default: '' },
    DATA_DIR: { default: '' },
    HOST: { default: '' },
    PORT_BASE: { default: 0 },
    PORT: { default: 0 },
    HMR_PORT: { default: 0 },
    COLLAB_ENABLED: { default: false, client: true },
    COLLAB_SERVER_PORT: { default: 0 },
    API_SERVER_PORT: { default: 0 },
    DEV_DOCUMENT_ID: { default: '', client: true },
    YSWEET_CONNECTION_STRING: { default: '' },
    // Private key passed to the Y-Sweet process so it can verify document tokens.
    YSWEET_AUTH_KEY: { default: '' },
    // Server token used by RemDo API and backup tools when calling Y-Sweet.
    YSWEET_SERVER_TOKEN: { default: '' },
    // Better Auth application secret.
    AUTH_SECRET: { default: '' },
    // Operator secret for admin provisioning actions.
    ADMIN_SECRET: { default: '' },
    // Canonical public app URL for server-mode auth and gateway behavior.
    APP_PUBLIC_URL: { default: '' },
    // Product signup policy. tools/env.defaults.sh sets true outside production.
    ALLOW_SIGNUP: { default: false },
    PREVIEW_PORT: { default: 0 },
    VITEST_PORT: { default: 0 },
    VITEST_PREVIEW_PORT: { default: 0 },
    PLAYWRIGHT_UI_PORT: { default: 0 },
    CI: { default: false },
    VITEST_PREVIEW: { default: false },
  } satisfies EnvSpec,
);
