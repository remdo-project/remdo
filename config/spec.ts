import type { EnvSpec } from './_internal/env/parse';
import { defineEnvDerivatives, defineEnvSpec } from './_internal/env/parse';

export const envSpec = defineEnvSpec(
  {
    NODE_ENV: { default: 'development' },
    DATA_DIR: { default: 'data' },
    HOST: { default: '127.0.0.1' },
    PORT: { default: 4000 },
    HMR_PORT: { default: 0 },
    COLLAB_ENABLED: { default: true, client: true },
    COLLAB_SERVER_PORT: { default: 0 },
    COLLAB_CLIENT_PORT: { default: 0, client: true },
    COLLAB_DOCUMENT_ID: { default: 'main', client: true },
    COLLAB_ORIGIN: { default: '', client: true },
    PREVIEW_PORT: { default: 0 },
    VITEST_PORT: { default: 0 },
    VITEST_PREVIEW_PORT: { default: 0 },
    PLAYWRIGHT_UI_PORT: { default: 0 },
    CI: { default: false },
    VITEST_PREVIEW: { default: false },
  } satisfies EnvSpec,
);

export const envDerivedDefaults = defineEnvDerivatives(envSpec, (env) => {
  env.HMR_PORT ||= env.PORT + 1;
  env.VITEST_PORT ||= env.PORT + 2;
  env.VITEST_PREVIEW_PORT ||= env.PORT + 3;
  env.COLLAB_SERVER_PORT ||= env.PORT + 4;
  env.COLLAB_CLIENT_PORT ||= env.COLLAB_SERVER_PORT || env.PORT + 4;
  env.PREVIEW_PORT ||= env.PORT + 5;
  env.PLAYWRIGHT_UI_PORT ||= env.PORT + 6;
});
