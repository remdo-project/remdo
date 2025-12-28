/* eslint-disable node/prefer-global/process */
import { loadEnv } from './_internal/env/load';

// eslint-disable-next-line ts/no-unnecessary-condition -- in browser process is a stub with no versions
const isNodeRuntime = Boolean(globalThis.process?.versions?.node);

const loaded = (() => {
  if (isNodeRuntime) {
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

    return loadEnv((key) => process.env[key]);
  }

  return loadEnv((key) => {
    if (key === 'NODE_ENV') {
      return import.meta.env.MODE;
    }

    const viteKey = `VITE_${key}`;
    return viteKey in import.meta.env ? import.meta.env[viteKey] : import.meta.env[key];
  });
})();

const runtime = loaded.runtime;
const serverEnv = loaded.server;
if (isNodeRuntime && !serverEnv.COLLAB_ORIGIN) {
  serverEnv.COLLAB_ORIGIN = `http://${serverEnv.HOST}:${serverEnv.COLLAB_SERVER_PORT}`;
}
const browserEnv = loaded.client;
const env = (isNodeRuntime ? serverEnv : browserEnv) as typeof serverEnv;

export const config = {
  env,
  browser: browserEnv,
  server: serverEnv,
  runtime,
  mode: runtime.mode,
  dev: runtime.isDev,
  prod: runtime.isProd,
  isDev: runtime.isDev,
  isProd: runtime.isProd,
  isTest: runtime.mode === 'test',
  isDevOrTest: runtime.isDev || runtime.mode === 'test',
} as const;
