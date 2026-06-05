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
    // Private key passed to Y-Sweet so it can verify document client tokens.
    YSWEET_AUTH_KEY: { default: '' },
    // Y-Sweet server token used by RemDo API and backup tools.
    YSWEET_SERVER_TOKEN: { default: '' },
    // Better Auth application secret.
    AUTH_SECRET: { default: '' },
    // Operator secret for admin provisioning actions.
    ADMIN_SECRET: { default: '' },
    // Canonical public app URL for server-mode auth and gateway behavior.
    APP_PUBLIC_URL: { default: '' },
    // Canonical auth URL. tools/env.defaults.sh derives this for local dev modes.
    AUTH_URL: { default: '' },
    // JSON array of configured remote RemDo servers available for OAuth account linking.
    LINKABLE_REMDO_SERVERS_JSON: { default: '' },
    // Stable dev-only OAuth client used by the home server to link the remote dev server.
    REMDO_DEV_OAUTH_CLIENT_ID: { default: '' },
    REMDO_DEV_OAUTH_CLIENT_SECRET: { default: '' },
    REMDO_DEV_HOME_ORIGIN: { default: '' },
    REMDO_DEV_REMOTE_ORIGIN: { default: '' },
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
