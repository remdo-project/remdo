/* eslint-disable node/prefer-global/process */
/* eslint-disable node/no-process-env */
/* eslint-disable no-restricted-syntax */
import { resolveConfig } from './env/resolve';

// eslint-disable-next-line ts/no-unnecessary-condition -- in browser process is a stub with no versions
const isNodeRuntime = Boolean(globalThis.process?.versions?.node);

const loaded = (() => {
  if (isNodeRuntime) {
    // Node-only: machine hostname feeds dev auth trusted-origin aliases. Required
    // lazily inside this branch so the browser bundle never pulls in node:os.
    // eslint-disable-next-line ts/no-require-imports -- Node-only branch; lazy so the browser bundle skips node:os
    const machineHostname = (require('node:os') as typeof import('node:os')).hostname();
    return resolveConfig((key) => process.env[key], { machineHostname });
  }

  return resolveConfig((key) => {
    if (key === 'NODE_ENV') {
      return import.meta.env.MODE;
    }

    const viteKey = `VITE_${key}`;
    return viteKey in import.meta.env ? import.meta.env[viteKey] : import.meta.env[key];
  }, { server: false });
})();

const runtime = loaded.runtime;
const serverEnv = loaded.server;
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
