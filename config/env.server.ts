import type { ParsedEnv } from './env.parse';
import process from 'node:process';
import { applyEnvDerivatives, parseEnv, pickClientEnv } from './env.parse';
import { envDerivedDefaults, envSpec } from './env.spec';

// don't complain about missing .env.test.* files, use just silently use .env.*
const nodeEnv = process.env.NODE_ENV || 'development';

const envFiles = [
  `.env.${nodeEnv}.local`,
  `.env.${nodeEnv}`,
  '.env.local',
  '.env',
];

for (const file of envFiles) {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT') {
      throw error;
    }
  }
}

const base = parseEnv(envSpec, (key) => process.env[key]);

export const env: ParsedEnv<typeof envSpec> = applyEnvDerivatives(base, envDerivedDefaults);

export const browserEnv = pickClientEnv(envSpec, env);
