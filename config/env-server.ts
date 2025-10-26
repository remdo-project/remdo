import type { ParsedEnv } from './env.parse';
import process from 'node:process';
import dotenvFlow from 'dotenv-flow';
import { applyEnvDerivatives, parseEnv, pickClientEnv } from './env.parse';
import { envDerivedDefaults, envSpec } from './env.spec';

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

const base = parseEnv(envSpec, (key) => process.env[key]);

export const env: ParsedEnv<typeof envSpec> = applyEnvDerivatives(base, envDerivedDefaults);

export const browserEnv = pickClientEnv(envSpec, env);
