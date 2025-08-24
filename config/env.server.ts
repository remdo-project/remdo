import 'dotenv/config';
import { cleanEnv, num, bool } from 'envalid';

export const env = cleanEnv(process.env, {
  PORT: num({ default: 3010 }),
  FORCE_WEBSOCKET: bool({ default: false }),
  CI: bool({ default: false }),
});
