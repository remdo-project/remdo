/* eslint-disable node/no-process-env -- env loader needs direct Node.js environment access */
import process from 'node:process';
import dotenvFlow from 'dotenv-flow';
import { bool, cleanEnv, num, port, str } from 'envalid';

// don't complain about missing .env.test.* files, use just silently use .env.*
const nodeEnv = process.env.NODE_ENV || 'development';

dotenvFlow.config({
  silent: true,
  files: [
    '.env',
    '.env.local',
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
  ],
});

const base = cleanEnv(process.env, {
  HOST: str({ default: '127.0.0.1' }),
  PORT: num({ default: 4000 }),
  HMR_PORT: port({ default: 0 }), // placeholder
  COLLAB_SERVER_PORT: port({ default: 0 }), // placeholder
  COLLAB_CLIENT_PORT: port({ default: 0 }), // placeholder
  VITEST_PORT: port({ default: 0 }), // placeholder
  VITEST_PREVIEW_PORT: port({ default: 0 }), // placeholder
  CI: bool({ default: false }),
  VITEST_PREVIEW: bool({ default: false }),
});

export const env = {
  ...base,
  HMR_PORT: base.HMR_PORT || (base.PORT + 1),
  COLLAB_SERVER_PORT: base.COLLAB_SERVER_PORT || (base.PORT + 4),
  COLLAB_CLIENT_PORT: base.COLLAB_CLIENT_PORT || base.COLLAB_SERVER_PORT || (base.PORT + 4),
  VITEST_PORT: base.VITEST_PORT || (base.PORT + 2),
  VITEST_PREVIEW_PORT: base.VITEST_PREVIEW_PORT || (base.PORT + 3),
};

export const browserEnv = {
  COLLAB_CLIENT_PORT: env.COLLAB_CLIENT_PORT,
};
