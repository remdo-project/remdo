import process from 'node:process';
import { loadEnv } from './_internal/env/load';

const nodeEnv = process.env.NODE_ENV ?? 'development';

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

const loaded = loadEnv((key) => process.env[key]);

export const env = loaded.server;
export const browserEnv = loaded.client;
export const runtime = loaded.runtime;
