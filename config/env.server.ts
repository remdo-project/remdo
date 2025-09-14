import 'dotenv/config';
import { cleanEnv, num, bool, str } from 'envalid';

export const env = cleanEnv(process.env, {
  PORT: num({ default: 3010 }),
  FORCE_WEBSOCKET: bool({ default: false }),
  CI: bool({ default: false }),
  DEBUG: str({ default: '' }), //not a bool, since some tools (like playwright treat this as a sting, ex. "pw:*")
  VITEST_SERIALIZATION_FILE: str({ default: '' }),
  VITE_PERFORMANCE_TESTS: bool({ default: false }),
  VITE_LOG_LEVEL: str({ default: '' }),
});
