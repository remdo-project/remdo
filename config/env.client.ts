import { parseEnv } from './env.parse';
import { envSpec } from './env.spec';

const parsed = parseEnv(envSpec, (key) => import.meta.env[`VITE_${key}`]);

export const env = {
  mode: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
  collabPort: parsed.COLLAB_CLIENT_PORT,
  collabEnabled: parsed.COLLAB_ENABLED,
} as const;
