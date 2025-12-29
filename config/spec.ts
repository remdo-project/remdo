import type { EnvSpec } from './_internal/env/parse';
import { defineEnvSpec } from './_internal/env/parse';

export const envSpec = defineEnvSpec(
  {
    NODE_ENV: { default: '' },
    DATA_DIR: { default: '' },
    HOST: { default: '' },
    PORT: { default: 0 },
    HMR_PORT: { default: 0 },
    COLLAB_ENABLED: { default: false, client: true },
    COLLAB_SERVER_PORT: { default: 0 },
    COLLAB_CLIENT_PORT: { default: 0, client: true },
    COLLAB_DOCUMENT_ID: { default: '', client: true },
    PREVIEW_PORT: { default: 0 },
    VITEST_PORT: { default: 0 },
    VITEST_PREVIEW_PORT: { default: 0 },
    PLAYWRIGHT_UI_PORT: { default: 0 },
    CI: { default: false },
    VITEST_PREVIEW: { default: false },
  } satisfies EnvSpec,
);
