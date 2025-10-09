import process from 'node:process';
import 'dotenv-flow/config';
import { bool, cleanEnv, num, str, port } from 'envalid';

const base = cleanEnv(process.env, {
  HOST: str({ default: '127.0.0.1' }),
  PORT: num({ default: 3020 }),
  HMR_PORT: port({ default: 0 }), // placeholder
  CI: bool({ default: false }),
});

export const env = {
  ...base,
  HMR_PORT: base.HMR_PORT || (base.PORT + 1),
}
