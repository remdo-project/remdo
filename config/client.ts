import { loadEnv } from './_internal/env/load';

const loaded = loadEnv((key) => {
  if (key === 'NODE_ENV') {
    return import.meta.env.MODE;
  }

  const viteKey = `VITE_${key}`;
  return viteKey in import.meta.env ? import.meta.env[viteKey] : import.meta.env[key];
});

export const config = {
  ...loaded.client,
  mode: loaded.runtime.mode,
  isDev: loaded.runtime.isDev,
  isProd: loaded.runtime.isProd,
} as const;
