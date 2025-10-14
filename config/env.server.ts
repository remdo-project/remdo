import process from 'node:process';
import dotenvFlow from 'dotenv-flow';
import { bool, cleanEnv, num, port, str } from 'envalid';

// don't complain about missing .env.test.* files, use just silently use .env.*
dotenvFlow.config({
  node_env: process.env.NODE_ENV || 'development',
  default_node_env: 'development',
  silent: true,
});

const base = cleanEnv(process.env, {
  HOST: str({ default: '127.0.0.1' }),
  PORT: num({ default: 4000 }),
  HMR_PORT: port({ default: 0 }), // placeholder
  VITEST_PORT: port({ default: 0 }), // placeholder
  CI: bool({ default: false }),
  VITEST_PREVIEW: bool({ default: false }),
});

export const env = {
  ...base,
  HMR_PORT: base.HMR_PORT || (base.PORT + 1),
  VITEST_PORT: base.VITEST_PORT || (base.PORT + 2),
}
