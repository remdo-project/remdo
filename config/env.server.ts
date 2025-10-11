import process from 'node:process';
import { bool, cleanEnv, num, port, str } from 'envalid';
import 'dotenv-flow/config';

const base = cleanEnv(process.env, {
  HOST: str({ default: '127.0.0.1' }),
  PORT: num({ default: 3020 }),
  HMR_PORT: port({ default: 0 }), // placeholder
  CI: bool({ default: false }),
  VITEST_PREVIEW: bool({ default: false }),
});

export const env = {
  ...base,
  HMR_PORT: base.HMR_PORT || (base.PORT + 1),
}
